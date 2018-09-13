import { Expression, CompareExpression } from 'yasqlp';
import deepEqual from 'deep-equal';

import { rewrite } from '../traverse';

type AndGraphNode = {
  id: number,
  names: Expression[],
  connections: {
    op: CompareExpression['op'],
    id: number,
  }[],
  constants: {
    op: CompareExpression['op'],
    value: Expression,
  }[],
};

export type AndGraphExpression = {
  type: 'custom',
  customType: 'andGraph',
  nodes: AndGraphNode[],
  leftovers: Expression[],
};

function isConstant(expr: Expression) {
  // TODO handle constant arithmetic
  return ['number', 'boolean', 'string'].includes(expr.type);
}

function findNode(expr: Expression, nodes: AndGraphNode[]) {
  let currentNode = nodes.find(node =>
    node.names.some(v => deepEqual(v, expr)));
  if (currentNode == null) {
    currentNode = {
      id: nodes.length,
      names: [expr],
      connections: [],
      constants: [],
    };
    nodes.push(currentNode);
  }
  return currentNode;
}

function handleCompare(
  op: CompareExpression['op'], left: Expression, right: Expression,
  nodes: AndGraphNode[],
) {
  let currentNode = findNode(left, nodes);
  if (!isConstant(right)) {
    // Find a node associated with right node and add connection to it.
    let rightNode = findNode(right, nodes);
    currentNode.connections.push({ op, id: rightNode.id });
    rightNode.connections.push({
      op: COMPARE_REVERSES[op],
      id: currentNode.id,
    });
  } else {
    currentNode.constants.push({
      op,
      value: right,
    });
  }
}

const COMPARE_REVERSES = {
  '=': '=' as '=',
  '!=': '!=' as '!=',
  '>=': '<=' as '<=',
  '<=': '>=' as '>=',
  '>': '<' as '<',
  '<': '>' as '>',
  'is': 'is' as 'is',
  'like': 'like' as 'like',
};

export default function generateGraph(input: Expression) {
  // Recursively descend into AND nodes.
  return rewrite(input, {}, (expr, state) => {
    if (expr.type === 'logical' && expr.op === '&&') {
      let nodes: AndGraphNode[] = [];
      let leftovers: Expression[] = [];
      expr.values.forEach((value) => {
        if (value.type === 'compare') {
          // Connection is performed on both side, left and right.
          if (!isConstant(value.left)) {
            handleCompare(value.op, value.left, value.right, nodes);
          }
          if (!isConstant(value.right)) {
            handleCompare(COMPARE_REVERSES[value.op],
              value.right, value.left, nodes);
          }
        } else if (value.type === 'boolean') {
          if (value.value === false) {
            leftovers.push(value);
          }
        } else {
          leftovers.push(value);
        }
      });
      return {
        expr: {
          type: 'custom',
          customType: 'andGraph',
          nodes,
          leftovers, 
        },
        state,
      };
    }
    return { expr, state };
  });
}
