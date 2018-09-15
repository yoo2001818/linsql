import { Expression, CompareExpression } from 'yasqlp';
import deepEqual from 'deep-equal';

import { rotateCompareOp, isConstant } from '../op';
import { rewrite } from '../traverse';
import hashCode from '../../util/hashCode';

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

export class AndGraphFactory {
  nodes: AndGraphNode[];
  leftovers: Expression[];
  nodeMap: { [key: number]: number };
  constructor() {
    this.nodes = [];
    this.leftovers = [];
    this.nodeMap = {};
  }
  createNode() {
    let node: AndGraphNode = {
      id: this.nodes.length,
      names: [],
      connections: [],
      constants: [],
    };
    this.nodes.push(node);
    return node;
  }
  findNode(expr: Expression) {
    let id = this.nodeMap[hashCode(expr)];
    if (id != null) {
      return this.nodes[id];
    } else {
      return null;
    }
  }
}

export type AndGraphExpression = {
  type: 'custom',
  customType: 'andGraph',
  nodes: AndGraphNode[],
  leftovers: Expression[],
};

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
      op: rotateCompareOp(op),
      id: currentNode.id,
    });
  } else {
    currentNode.constants.push({
      op,
      value: right,
    });
  }
}

export default function rewriteGraph(input: Expression) {
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
            handleCompare(rotateCompareOp(value.op),
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
