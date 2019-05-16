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
  | symbol
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
      if (typeof aValue === 'symbol' || typeof bValue === 'symbol') {
        throw new Error('Unexpected symbol');
      }
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
//
// For OR, we need to find the cheapest division point. However, since it can be
// implemented using index merging, (although it'd be merged using different
// logic...) it shouldn't distinguish between nodes - it should just merge them
// if possible.
// 
// AND is different, we can choose any of the nodes, and it'd be suffice anyway.
// However, to generate optimized plan, we need to separate columns and try to
// use 'largest' index if possible.
//
// We might end up comparing all the indexes in the table, but that's okay.
//

type RangeOp = '>' | '<' | '=' | '!=' | '>=' | '<=';
type ValueExpression = BooleanValue | StringValue | NumberValue;

interface RangeOrNode {
  type: 'or',
  columns: string[],
  nodes: RangeNode[],
}

interface RangeAndNode {
  type: 'and',
  columns: string[],
  columnNodes: { [column: string]: RangeNode[] },
  compoundNodes: RangeNode[],
}

interface RangeCompareNode {
  type: 'compare',
  column: string,
  op: RangeOp,
  value: ValueExpression,
}

type RangeNode = RangeOrNode | RangeAndNode | RangeCompareNode;

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
      if (expr.op === '&&') {
        let columns: { [column: string]: true } = {};
        let columnNodes: { [column: string]: RangeNode[] } = {};
        let compoundNodes: RangeNode[] = [];
        for (let child of expr.values) {
          const returned = getRangeNode(name, child);
          if (returned == null) continue;
          switch (returned.type) {
            case 'and':
              // Merge two nodes.
              for (let column of returned.columns) {
                columns[column] = true;
              }
              for (let column in returned.columnNodes) {
                columnNodes[column] = [
                  ...columnNodes[column] || [],
                  ...returned.columnNodes[column],
                ]
              }
              compoundNodes = [
                ...compoundNodes,
                ...returned.compoundNodes,
              ];
            case 'or':
              if (returned.columns.length === 1) {
                const column = returned.columns[0];
                columns[column] = true;
                columnNodes[column] = columnNodes[column] || [];
                columnNodes[column].push(returned);
              } else {
                for (let column of returned.columns) {
                  columns[column] = true;
                }
                compoundNodes.push(returned);
              }
              break;
            case 'compare':
              columns[returned.column] = true;
              columnNodes[returned.column] = columnNodes[returned.column] || [];
              columnNodes[returned.column].push(returned);
              break;
          }
        }
        return {
          type: 'and',
          columns: Object.keys(columns),
          columnNodes,
          compoundNodes,
        };
      } else {
        let columns: { [column: string]: true } = {};
        let nodes: RangeNode[] = [];
        for (let child of expr.values) {
          const returned = getRangeNode(name, child);
          if (returned == null) continue;
          nodes.push(returned);
          switch (returned.type) {
            case 'and':
              for (let column of returned.columns) {
                columns[column] = true;
              }
              break;
            case 'or':
              // Merge two nodes...
              for (let column of returned.columns) {
                columns[column] = true;
              }
              nodes = [...nodes, ...returned.nodes];
              break;
            case 'compare':
              columns[returned.column] = true;
              break;
          }
        }
        return {
          type: 'or',
          columns: Object.keys(columns),
          nodes,
        };
      }
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
        let columns: { [column: string]: true } = {};
        let columnNodes: { [column: string]: RangeNode[] } = {};
        andGraph.nodes.forEach(node => {
          let targetNames = node.names.filter(v =>
            v.type === 'column' && v.table === name);
          targetNames.forEach(targetName => {
            if (targetName.type !== 'column') return;
            const { name } = targetName;
            columns[name] = true;
            columnNodes[name] = columnNodes[name] || [];
            node.constraints.forEach(expr => {
              columnNodes[name].push(getRangeNode(name, expr, targetName.name));
            });
          });
        });
        return {
          type: 'and',
          columns: Object.keys(columns),
          columnNodes,
          compoundNodes: andGraph.leftovers
            .map(node => getRangeNode(name, node))
            .filter(v => v != null),
        };
      }
      break;
  }
}

interface IndexTreeNode {
  columns: string[],
  indexes: Index[],
  children: { [key: string]: IndexTreeNode },
}

function getIndexTree(table: NormalTable): IndexTreeNode {
  let output: IndexTreeNode = {
    columns: [],
    indexes: [],
    children: {},
  };
  table.indexes.forEach((index) => {
    output.indexes.push(index);
    index.order.reduce((node, order) => {
      let child = node.children[order.key];
      if (child == null) {
        child = node.children[order.key] = {
          columns: [...node.columns, order.key],
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
  values: RangeSet<IndexValue>,
}

interface SargMergeNode {
  type: 'merge',
  nodes: SargScanNode[],
}

type SargNode = SargScanNode | SargMergeNode;

// Merges scan node /w OR.
function mergeScanNodeOr(
  a: SargScanNode,
  b: SargScanNode,
): SargScanNode | null {
  // Check if the node is compatiable.
  // Two nodes are compatiable with each other if:
  // 1. At least one node completely includes another node.
  // 2. If the nodes are not referencing same indexes, only the rightmost
  //    lookup should be range lookup.
  // If the nodes have common ancestor, we may opt to use them. But in that
  // case, using index merge would be faster.
  const aIsSmaller = a.index.columns.length <= b.index.columns.length;
  const smallNode = aIsSmaller ? a : b;
  const largeNode = aIsSmaller ? b : a;
  const smallColumns = smallNode.index.columns;
  const largeColumns = largeNode.index.columns;
  // Check if the node contains another node, then bail out if it's not.
  if (!smallColumns.every((v, i) => largeColumns[i] === v)) {
    return null;
  }
  const minFiller: typeof negativeInfinity[] = [];
  const maxFiller: typeof positiveInfinity[] = [];
  for (let i = 0; i < largeColumns.length - smallColumns.length; i += 1) {
    minFiller.push(negativeInfinity);
    maxFiller.push(positiveInfinity);
  }
  // ... Merge two nodes.
  return {
    type: 'scan',
    index: largeNode.index,
    values: rangeSet.or(
      largeNode.values,
      // We have to attach the lower value. This is weird, but still necessary.
      smallNode.values.map((value) => ({
        min: [...value.min, ...minFiller],
        max: [...value.max, ...maxFiller],
        minEqual: value.minEqual,
        maxEqual: value.maxEqual,
      })),
    ),
  };
}

// Make scan node to descend into column, making it to filter more values.
// However, this may fail if the parent value is a range. In that case,
// fulfilled will be false.
function descendScanNode(
  node: SargScanNode,
  column: string,
  rangeSet: RangeSet<IndexValue>,
): { fulfilled: boolean, node: SargScanNode | null } {
  const newIndex = node.index.children[column];
  if (newIndex == null) {
    return { fulfilled: false, node: null };
  }
  let fulfilled = true;
  let output = [];
  for (let i = 0; i < node.values.length; i += 1) {
    let nodeValue = node.values[i];
    if (nodeValue.min !== nodeValue.max) {
      fulfilled = false;
      output.push({
        ...nodeValue,
        min: [...nodeValue.min, negativeInfinity],
        max: [...nodeValue.max, positiveInfinity],
      });
    } else {
      for (let j = 0; j < rangeSet.length; j += 1) {
        let rangeValue = rangeSet[j];
        output.push({
          ...rangeValue,
          min: [...nodeValue.min, ...rangeValue.min],
          max: [...nodeValue.max, ...rangeValue.max],
        })
      }
    }
  }
  return {
    fulfilled,
    node: {
      type: 'scan',
      index: newIndex,
      values: output,
    },
  };
}

// Checks if the node can be descended without hassle.
// TODO Calculate cost and selectivity?
function canDescend(node: SargScanNode): boolean {
  return node.values.every(v => {
    return v.min[v.min.length - 1] === v.max[v.max.length - 1];
  });
}

function convertRangeNode(
  node: RangeNode,
  column: string,
): RangeSet<IndexValue> | null {
  switch (node.type) {
    case 'and': {
      let columnNodes = node.columnNodes[column];
      if (columnNodes == null) {
        throw new Error('AND node doesn\'t have column ' + column);
      }
      return rangeSet.and(
        ...columnNodes
          .map(v => convertRangeNode(v, column))
          .filter(v => v != null),
      );
    }
    case 'or':
      return rangeSet.or(
        ...node.nodes
          .map(v => convertRangeNode(v, column))
          .filter(v => v != null),
      );
    case 'compare':
      if (node.column !== column) {
        throw new Error('Unexpected column ' + node.column);
      }
      switch (node.op) {
        case '=':
          return rangeSet.eq([node.value.value]);
        case '>':
          return rangeSet.gt([node.value.value]);
        case '<':
          return rangeSet.lt([node.value.value]);
        case '>=':
          return rangeSet.gte([node.value.value]);
        case '<=':
          return rangeSet.lte([node.value.value]);
        case '!=':
          return rangeSet.neq([node.value.value]);
      }
  }
}

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
    case 'and': {
      // 1. Merge column-exclusive nodes first
      // 2. Traverse compound nodes, then merge them if possible to do so.
      //    (For example, a > 1 AND (a = 1 OR b > 1)) 
      //    Merging between compound nodes is not possible for now.
      //    We might have to do trim off unnecessary nodes.
      // Merging is only possible if they share mutual index lookups.
      const columnRanges: { [name: string]: RangeSet<IndexValue> } = {};
      // Determine the selectivity 
      for (let column of node.columns) {
        columnRanges[column] = convertRangeNode(node, column);
      }
      // We have to scan each possible index, and determine what's the best.
      // We can opt to make plan for each index, however, that can be expensive
      // and index merge (OR) will be a problem.
      //
      // ... (a = 1 OR b = 1) AND c = 1 - query planner can opt to use...
      // - a = 1 OR b = 1 -> index merge -> filter
      // - c = 1 -> filter
      // - given that (c, a), (c, b) indexes exist, use the compound index.
      // - or in other direction, (a, c), (b, c) is applicable too.
      //
      // As the latter case implies, each predicate can influence other
      // predicates to use compound index.
      // 
      // We may think separating each lookup when OR is encountered is good,
      // but that may generate too much OR lookup query - which is completely
      // unacceptable.
      // For example, (a = 1 OR b = 1) AND (a = 1 OR b = 1) AND ... will
      // generate 2^n lookup queries if not optimized properly.
      //
      // Clearly, we need to calculate costs and prune the tree, and influence
      // other queries.
      //
      // a = 1 AND b = 1 AND (b = 1 OR a = 2)
      // a: 1, b: 1, compound: b = 1 OR a = 2
      // ... a = 2 should be FALSE.

      // We can merge nodes to use compound indexes, however, this requires
      // every step requires its own index. We can manage a 'virtual index' to
      // make each node return possible outputs, or, try to mux them using
      // its metadata, so it can directly correlate to index scan.
      //
      // The problem is, AND operations can be managed using this way. But,
      // OR operation clearly doesn't work like that - index merges are supposed
      // to happen.
      //
      // We can try thinking them separately if this becomes too much problem.
      /*
        1. a = 3
        2. a > 3
        3. a > 3 AND a < 8
        4. a = 3 AND b = 3
        5. a > 3 AND a < 8 AND b = 3
        6. a = 3 OR a = 4
        7. a = 3 OR b = 3
        8. a > 3 OR b > 3
        9. (a > 3 AND a < 8) OR b > 3
        10. (a = 3 AND b = 3) OR c = 3
        11. (a = 3 AND b > 3) OR a > 3
        12. (a = 3 AND b > 3) OR c = 3
        13. (a = 3 OR b = 3) AND c = 3
        14. (a > 3 OR b > 3) AND c = 3
        15. (a = 3 OR b = 3) AND c > 3
        16. (a = 3 OR b = 3) AND (c = 3 OR d = 3)
        17. (a > 3 OR b > 3) AND (c > 3 OR d > 3)
       */
      // 1. a = 3 -> a, with equal scan.
      // 2. a > 3 -> a, with range scan.
      // 3. a > 3 AND a < 8 -> a, with range scan.
      // 4. a = 3 AND b = 3 ->
      //    Since a and b both relies on equal scan, (a, b) or (b, a) is both
      //    possible.
      //    Try each column on trie, and choose the best one from it.
      // 5. a > 3 AND a < 8 AND b = 3 ->
      //    a relies on range scan, and b relies on equal scan.
      //    (b, a) can be leveraged - Still, try each index and find the best
      //    one.
      // 6. a = 3 OR a = 4 -> a, with equal scan.
      // 7. a = 3 OR b = 3 ->
      //    Since both are not the same column, split the scan into two and
      //    merge the two.
      // 8. a > 3 OR b > 3 -> Same with 7.
      // 9. (a > 3 AND a < 8) OR b > 3 -> Same with 7.
      // 10. (a = 3 AND b = 3) OR c = 3 -> Same with 8.
      // 11. (a = 3 AND b > 3) OR a > 3 ->
      //     This is an interesting case, because a > 3 can be merged into
      //     (a, b) index. OR should move it into lower index if it's possible
      //     to do so.
      // 12. (a = 3 AND b > 3) OR c = 3 -> Same with 10.
      // 13. (a = 3 OR b = 3) AND c = 3 ->
      //     This becomes really complex because c = 3 can be used by OR clause,
      //     which breaks divide-and-conquer strategy - it suddenly became too
      //     complex.
      //     Instead choosing index inside OR block, it can just return the
      //     possible scans of columns, and AND block can choose what's best for
      //     the given data.
      // 13-1. a > 3 OR (a = 3 AND (b > 3 OR (b = 3 AND c > 3))))
      //     We can do cartesian product? Honestly, I don't think there's better
      //     structure...
      //     b: 3, c > 3 or b > 3
      // 14. (a > 3 OR b > 3) AND c = 3
      //     We can just use c = 3, or, use a > 3 / b > 3 using cartesian
      //     product. Cartesian products should be avoided when there's no
      //     proper index for given columns. (a, b index should exist)
      // 15. (a = 3 OR b = 3) AND c = 3
      //     For this, just use cartesian product too.
      // 16. (a = 3 OR b = 3) AND (c = 3 OR d = 3)
      //     Unlike previous ones, this actually requires product with two OR,
      //     which may have a problem. There must be a bailout logic - just give
      //     up the OR selection - when both index doesn't exist, etc.
      // 17. (a > 3 OR b > 3) AND (c > 3 OR d > 3)
      //     For this case, cartesian product clearly doesn't help at all
      //     because both relies on range lookup - in this case, we have to
      //     compare two and choose the winner.
      let plans: SargNode[] = [];
      for (let column of node.columns) {
        if (indexes.children[column] != null) {
          const targetIndex = indexes.children[column];
          plans.push({
            type: 'scan',
            index: targetIndex,
            values: columnRanges[column],
          });
        }
      }
      console.log(plans);
      break;
    }
    case 'or': {
      // 1. Traverse each node and merge them.
      break;
    }
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
