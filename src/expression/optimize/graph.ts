import { Expression, CompareExpression } from 'yasqlp';
import deepEqual from 'deep-equal';

import { rewrite } from '../traverse';

type AndGraphNode = {
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

export default function generateGraph(input: Expression) {
  // Recursively descend into AND nodes.
  function handleCompare(
    op: CompareExpression['op'], left: Expression, right: Expression,
    nodes: AndGraphNode[],
  ) {
    let currentNode = nodes.find(node =>
      node.names.some(v => deepEqual(v, left)));
    if (currentNode == null) {
      currentNode = {
        names: [left],
        connections: [],
        constants: [],
      };
      nodes.push(currentNode);
    }
    if (!isConstant(right)) {
      
    } else {
      currentNode.constants.push({
        op,
        value: right,
      });
    }
  }
  return rewrite(input, {}, (expr, state) => {
    if (expr.type === 'logical' && expr.op === '&&') {
      let nodes: AndGraphNode[] = [];
      let leftovers: Expression[] = [];
      expr.values.forEach((value) => {
        if (value.type === 'compare') {
          // Connection is performed on both side, left and right.
          if (!isConstant(value.left)) {
            handleCompare(value.left, value.right, nodes);
          }
          if (!isConstant(value.right)) {
            handleCompare(value.right, value.left, nodes);
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
