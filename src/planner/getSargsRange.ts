import { Expression, BooleanValue, StringValue, NumberValue } from 'yasqlp';
import createRangeSetModule, { RangeSet } from 'range-set';

import { NormalTable, Index } from '../table';
import { AndGraphExpression } from '../expression/optimize/graph';
import { rotateCompareOp } from '../expression/op';

const numberDescriptor = {
  compare: (a: number, b: number) => a - b,
  isPositiveInfinity: (v: number) => v === Infinity,
  isNegativeInfinity: (v: number) => v === -Infinity,
  positiveInfinity: Infinity,
  negativeInfinity: -Infinity,
};

const positiveInfinity = Symbol('+Infinity');
const negativeInfinity = Symbol('-Infinity');

const stringDescriptor = {
  compare: (a: string, b: string) => {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  },
  isPositiveInfinity: (v: any) => v === positiveInfinity,
  isNegativeInfinity: (v: any) => v === negativeInfinity,
  positiveInfinity: positiveInfinity,
  negativeInfinity: negativeInfinity,
};

type IndexValue = (
  | string
  | number
  | boolean
  | typeof positiveInfinity
  | typeof negativeInfinity
)[];

const rangeSetDescriptor = {
  // Even though this is compared using > and <, each value must consist of
  // same type.
  compare: (a: IndexValue, b: IndexValue) => {
    for (let i = 0; i < a.length; i += 1) {
      const aValue = a[i];
      const bValue = b[i];
      if (aValue === positiveInfinity && bValue === positiveInfinity) return 0;
      if (aValue === positiveInfinity) return 1;
      if (bValue === positiveInfinity) return -1;
      if (aValue === negativeInfinity && bValue === negativeInfinity) return 0;
      if (aValue === negativeInfinity) return -1;
      if (bValue === negativeInfinity) return 1;
      if (typeof aValue !== typeof bValue) {
        throw new Error('Uncomparable type');
      }
      if (aValue > bValue) return 1;
      if (aValue < bValue) return -1;
      return 0;
    }
    return 0;
  },
  isPositiveInfinity: (v: IndexValue) => v[0] === positiveInfinity,
  isNegativeInfinity: (v: IndexValue) => v[0] === negativeInfinity,
  positiveInfinity: [positiveInfinity as typeof positiveInfinity],
  negativeInfinity: [negativeInfinity as typeof negativeInfinity],
};

const rangeSet = createRangeSetModule(rangeSetDescriptor);

// We have to handle more than one columns, to be exact, N 'equal' columns
// and one range columns.
//
// Right columns can't be used until left columns are specified using '=',
// and only rightmost column can use range queries like '>', '<'.
// Note that we don't have to use all the columns - we still can use
// range queries when the columns are not used completely.
//
// However, there is one exception - a expression can be converted to one
// range scan.
// a > 3 OR (a = 3 AND b > 5)
// a >= 3 AND (a > 3 OR b > 5)
// ...both can be converted into ((3, 5) ... inf), for (a, b) index.
// 
// First one is pretty straightforward - since both ranges are inside (a, b)
// index's range, they just have to merged together.
// Second one can be a little tricky to derive the ranges. a >= 3 is easy
// to derive, however, (a > 3 OR b > 5) requires the prior knowledge of
// a >= 3. 
// 
// Since second one is too hard to process, let's just process the first one.
//
// Expressions merged using 'AND' is simple to process - we can just ignore
// irrelevant columns. Of course, all columns must be present, but still it's
// simple enough.
// On the other hand, 'OR' requires all predicates are relevant to the index.
// 
// We need to note that range queries can only be done at the rightmost
// position, this is absolutely important.
// Other than non-range queries, we can consider them as a group, since
// their order shouldn't matter before picking an index.
//
// For example, (a = 1 AND b = 1 AND c = 1) AND d > 5
// d > 5 should be rightmost one, but others are not.
//
// (a = 1 OR b = 1 OR c = 1) is resolved using index merge, but this is out
// of scope for now.
//
// For this reason, ranges and non-ranges can be separated.
// However, this is not enough - we have to resolve
// a > 3 OR (a = 3 AND b > 5).
//
// This can be implemented by putting expression inside equal predicate.
// Then it can be freely converted into ranges, no matter how the indices are
// constructed.
// 
// Therefore, we'll construct a tree-like structure using this. This is very
// similiar to the original AST, but has more information about its children.
//
// a > 3 OR (a = 3 AND b > 5)
// OR -- a -- a > 3
//    \     \ AND -- a = 3 (master)
//    |     /       \ b > 5 (child)
//    \- b /
//
// (a = 1 AND b = 1 AND c = 1) OR a > 3
// OR -- a -- a > 3
//    |     + AND -- a = 1
//    |- b -|      | b = 1
//    |- c -|      | c = 1

interface RangeParentNode {
  type: 'and' | 'or',
  columns: { [column: string]: RangeNode[] },
}

type RangeOp = '>' | '<' | '=' | '!=' | '>=' | '<=';
type ValueExpression = BooleanValue | StringValue | NumberValue;

interface RangeCompareNode {
  type: 'compare',
  column: string,
  op: RangeOp,
  value: ValueExpression,
}

type RangeNode = RangeParentNode | RangeCompareNode;

function isRangeOp(op: string): op is RangeOp {
  return ['>', '<', '=', '!=', '>=', '<='].includes(op);
}

function getRangeNode(
  name: string,
  expr: Expression,
  forceColumn?: string | null,
): RangeNode | null {
  switch (expr.type) {
    case 'logical': {
      let output: { [column: string]: RangeNode[] } = {};
      for (let child of expr.values) {
        const returned = getRangeNode(name, child);
        if (returned == null) continue;
        switch (returned.type) {
          case 'and':
          case 'or':
            // Merge two
            for (let column in returned.columns) {
              output[column] = [
                ...output[column] || [],
                ...returned.columns[column],
              ];
            }
            break;
          case 'compare':
            output[returned.column] = output[returned.column] || [];
            output[returned.column].push(returned);
            break;
        }
      }
      return {
        type: expr.op === '&&' ? 'and' : 'or',
        columns: output,
      };
    }
    case 'compare': {
      if (expr.left.type === 'column' &&
        (forceColumn || expr.left.table === name) &&
        ['boolean', 'number', 'string'].includes(expr.right.type) &&
        isRangeOp(expr.op)
      ) {
        return {
          type: 'compare',
          column: forceColumn || expr.left.name,
          op: expr.op,
          value: expr.right as ValueExpression,
        };
      }
      if (expr.right.type === 'column' &&
        (forceColumn || expr.right.table === name) &&
        ['boolean', 'number', 'string'].includes(expr.left.type) &&
        isRangeOp(expr.op)
      ) {
        return {
          type: 'compare',
          column: forceColumn || expr.right.name,
          op: rotateCompareOp(expr.op) as RangeOp,
          value: expr.left as ValueExpression,
        };
      }
      break;
    }
    case 'custom': 
      if (expr.customType === 'andGraph') {
        let andGraph = expr as AndGraphExpression;
        let output: { [column: string]: RangeNode[] } = {};
        andGraph.nodes.forEach(node => {
          let targetNames = node.names.filter(v =>
            v.type === 'column' && v.table === name);
          targetNames.forEach(targetName => {
            if (targetName.type !== 'column') return;
            const { name } = targetName;
            output[name] = output[name] || [];
            node.constraints.forEach(expr => {
              output[name].push(getRangeNode(name, expr, targetName.name));
            });
          });
        });
      }
      break;
  }
}

interface IndexTreeNode {
  indexes: Index[],
  children: { [key: string]: IndexTreeNode },
}

function getIndexTree(table: NormalTable): IndexTreeNode {
  let output: IndexTreeNode = {
    indexes: [],
    children: {},
  };
  table.indexes.forEach((index) => {
    output.indexes.push(index);
    index.order.reduce((node, order) => {
      let child = node.children[order.key];
      if (child == null) {
        child = node.children[order.key] = {
          indexes: [],
          children: {},
        };
      }
      child.indexes.push(index);
      return child;
    }, output);
  });
  return output;
}

interface SargScanNode {
  type: 'scan',
  index: IndexTreeNode,
  values: RangeSet<any>,
  cost: number,
}

interface SargMergeNode {
  type: 'merge',
  nodes: SargScanNode[],
  cost: number,
}

type SargNode = SargScanNode | SargMergeNode;

function traverseNode(
  node: RangeNode,
  indexes: IndexTreeNode,
): SargNode {
  // We've retrieved the range node - now, check if which index is most
  // viable for the given range node.
  //
  // For AND node, we just have to try and find one best index.
  //
  // We can try using each column first, then extend to other columns if it's
  // satisifable (has no range query, has relations, etc.)
  // For example, a = 1 AND b > 1 can use (a, b) index. Since a = 1 only uses
  // equal query, we can just put b = 1 on the right.
  //
  // For OR node, we can try doing index merge - but we'd have to find perfect
  // separation point! For the sake of simplicity, we'll use full scan if
  // index merge is absolutely required.
  // 
  // However, index merge is not required in one particular case - 
  // a > 1 OR (a = 1 AND b > 3). Since a = 1 doesn't have range query, it can
  // use (a, b) lookup. a > 1 also can use (a, b) lookup. Therefore it can be
  // merged.
  //
  // To aid this, sarg scan node should return a list of next possible indexes.
  //
  switch (node.type) {
    case 'and':
      break;
    case 'or':
      break;
    case 'compare': {
      const childIndexes = indexes.children[node.column];
      if (childIndexes == null) {
        // Well, there's nothing to do here.
        return null;
      }
      let values;
      switch (node.op) {
        case '=':
          values = rangeSet.eq([node.value.value]);
        case '>':
          values = rangeSet.gt([node.value.value]);
        case '<':
          values = rangeSet.lt([node.value.value]);
        case '>=':
          values = rangeSet.gte([node.value.value]);
        case '<=':
          values = rangeSet.lte([node.value.value]);
        case '!=':
          values = rangeSet.neq([node.value.value]);
      }
      return {
        type: 'scan',
        index: childIndexes,
        values,
        cost: 0,
      };
    }
  }
}

export default function findSargsRange(
  name: string, table: NormalTable, where: Expression,
): SargNode {
  const node = getRangeNode(name, where);
  const indexes = getIndexTree(table);

  return traverseNode(node, indexes);
}
