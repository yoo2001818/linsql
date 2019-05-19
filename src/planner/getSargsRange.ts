import { Expression, BooleanValue, StringValue, NumberValue } from 'yasqlp';
import createRangeSetModule, { RangeSet } from 'range-set';

import { NormalTable, Index } from '../table';
import { AndGraphExpression } from '../expression/optimize/graph';
import { rotateCompareOp } from '../expression/op';

const positiveInfinity = Symbol('+Infinity');
const negativeInfinity = Symbol('-Infinity');

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
  nodes: RangeNode[],
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
        let nodes: RangeNode[] = [];
        for (let child of expr.values) {
          const returned = getRangeNode(name, child);
          if (returned == null) continue;
          nodes.push(returned);
          switch (returned.type) {
            case 'and':
              // Merge two nodes...
              for (let column of returned.columns) {
                columns[column] = true;
              }
              nodes = [...nodes, ...returned.nodes];
              break;
            case 'or':
              for (let column of returned.columns) {
                columns[column] = true;
              }
              break;
            case 'compare':
              columns[returned.column] = true;
              break;
          }
        }
        return {
          type: 'and',
          columns: Object.keys(columns),
          nodes,
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
        let nodes: RangeNode[] = [];
        andGraph.nodes.forEach(node => {
          let targetNames = node.names.filter(v =>
            v.type === 'column' && v.table === name);
          targetNames.forEach(targetName => {
            if (targetName.type !== 'column') return;
            const { name } = targetName;
            columns[name] = true;
            node.constraints.forEach(expr => {
              nodes.push(getRangeNode(name, expr, targetName.name));
            });
          });
        });
        andGraph.leftovers.forEach(node => {
          const result = getRangeNode(name, node);
          if (result != null) nodes.push(result);
        });
        return {
          type: 'and',
          columns: Object.keys(columns),
          nodes,
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

interface SargNode {
  columns: { [key: string]: {
    type: 'equal' | 'range',
    set: RangeSet<IndexValue>,
  } },
}

function hasRange(set: RangeSet<IndexValue>): boolean {
  return set.every(v => {
    return v.min[v.min.length - 1] === v.max[v.max.length - 1];
  });
}

function createSingleSargNode(
  column: string,
  type: 'equal' | 'range',
  set: RangeSet<IndexValue>,
): SargNode[] {
  return [{
    columns: {
      [column]: { type, set },
    },
  }];
}

function traverseNode(
  node: RangeNode,
  indexes: IndexTreeNode,
): SargNode[] {
  switch (node.type) {
    case 'and':
      break;
    case 'or':
      break;
    case 'compare': {
      const column = node.column;
      switch (node.op) {
        case '=':
          return createSingleSargNode(column, 'equal',
            rangeSet.eq([node.value.value]));
        case '>':
          return createSingleSargNode(column, 'range',
            rangeSet.gt([node.value.value]));
        case '<':
          return createSingleSargNode(column, 'range',
            rangeSet.lt([node.value.value]));
        case '>=':
          return createSingleSargNode(column, 'range',
            rangeSet.gte([node.value.value]));
        case '<=':
          return createSingleSargNode(column, 'range',
            rangeSet.lte([node.value.value]));
        case '!=':
          return createSingleSargNode(column, 'range',
            rangeSet.neq([node.value.value]));
      }
    }
  }
}
