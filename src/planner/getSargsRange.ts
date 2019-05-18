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

function convertRangeNode(
  node: RangeNode,
  column: string,
): SargNode {
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
          return {
            columns: {
              [column]: {
                type: 'equal',
                set: rangeSet.eq([node.value.value]),
              }
            }
          };
        case '>':
          return {
            columns: {
              [column]: {
                type: 'range',
                set: rangeSet.gt([node.value.value]),
              }
            }
          };
        case '<':
          return {
            columns: {
              [column]: {
                type: 'range',
                set: rangeSet.lt([node.value.value]),
              }
            }
          };
        case '>=':
          return {
            columns: {
              [column]: {
                type: 'range',
                set: rangeSet.gte([node.value.value]),
              }
            }
          };
        case '<=':
          return {
            columns: {
              [column]: {
                type: 'range',
                set: rangeSet.lte([node.value.value]),
              }
            }
          };
        case '!=':
          return {
            columns: {
              [column]: {
                type: 'range',
                set: rangeSet.neq([node.value.value]),
              }
            }
          };
      }
  }
}

function traverseNode(
  node: RangeNode,
  indexes: IndexTreeNode,
): SargNode[] {
  switch (node.type) {
    case 'and':
    case 'or':
      break;
    case 'compare':
      return [convertRangeNode(node, node.column)];
  }
}
