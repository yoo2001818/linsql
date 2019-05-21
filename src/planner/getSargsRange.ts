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

interface SargScanNodeColumn {
  type: 'equal' | 'range',
  set: RangeSet<IndexValue>,
}

interface SargScanNode {
  columns: { [key: string]: SargScanNodeColumn },
}

type SargNode = SargScanNode | true | false;

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
    case 'and': {
      let currentList: SargNode[] = [true];
      for (let childNode of node.nodes) {
        const childList = traverseNode(childNode, indexes);
        // Using the child sarg, perform cartesian product
        let result: SargNode[] = [];
        for (let current of currentList) {
          for (let child of childList) {
            // Validate if they're an array first:
            // - If one of them is false, it's false.
            // - If all of them is true, it's true.
            if (current === false || child === false) {
              continue;
            }
            if (current === true) {
              result.push(child);
              continue;
            }
            if (child === true) {
              result.push(current);
              continue;
            }
            // ... Perform merging each column;
            // - if one column becomes 'false', the entire sarg node becomes
            //   false.
            // - if all column becomes 'true' (including NULL), the entire sarg
            //   node becomes true, albeit this will never happen in AND node.
            let outputColumns: { [key: string]: SargScanNodeColumn } = {};
            let alwaysFalse: boolean = false;
            for (let key in child.columns) {
              const currentColumn = current.columns[key];
              const childColumn = child.columns[key];
              if (currentColumn == null) {
                outputColumns[key] = childColumn;
                continue;
              }
              // Try to combine two columns.
              const output = rangeSet.and(currentColumn.set, childColumn.set);
              if (output.length === 0) {
                alwaysFalse = true;
                break;
              }
              outputColumns[key] = {
                type: hasRange(output) ? 'range' : 'equal',
                set: output,
              };
            }
            if (alwaysFalse) {
              continue;
            }
            for (let key in current.columns) {
              if (child.columns[key] == null) {
                outputColumns[key] = current.columns[key];
              }
            }
            result.push({ columns: outputColumns });
          }
        }
        currentList = result;
      }
      return currentList;
    }
    case 'or': {
      let currentList: SargNode[] = [];
      // Well, to be simple, it can just append the node into current list.
      // But, single column entries deserve better - it can be merged.
      for (let childNode of node.nodes) {
        const childList = traverseNode(childNode, indexes);
        for (let child of childList) {
          if (child === true) {
            // Perform short circuit - there's no need to see anything else
            // anymore! :D
            return [true];
          }
          if (child === false) continue;
          // We can't bond anything more than single column...
          // TODO If only one mutual column varies, we can actually attach two
          // lists (Not sure if this would be helpful)
          const childKeys = Object.keys(child.columns); 
          if (childKeys.length > 1) {
            currentList.push(child);
          } else {
            let found = false;
            for (let i = 0; i < currentList.length; i += 1) {
              const current = currentList[i];
              if (typeof current === 'boolean') continue;
              const currentKeys = Object.keys(current.columns);
              if (currentKeys.length === 1 && currentKeys[0] === childKeys[0]) {
                // We've got a match! Try to replace the value.
                // Try to combine two columns.
                const key = currentKeys[0];
                const currentColumn = current.columns[key];
                const childColumn = child.columns[key];
                const output = rangeSet.or(currentColumn.set, childColumn.set);
                // TODO infinity check
                currentList[i] = {
                  columns: {
                    [key]: {
                      type: hasRange(output) ? 'range' : 'equal',
                      set: output,
                    },
                  }
                };
                found = true;
              }
            }
            if (!found) currentList.push(child);
          }
        }
      }
      return currentList;
    }
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
