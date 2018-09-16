import { Expression, CompareExpression } from 'yasqlp';

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

export type AndGraphExpression = {
  type: 'custom',
  customType: 'andGraph',
  nodes: AndGraphNode[],
  leftovers: Expression[],
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
      let node = this.createNode();
      node.names.push(expr);
      this.nodeMap[hashCode(expr)] = node.id;
      return node;
    }
  }
  mergeNode(left: AndGraphNode, right: AndGraphNode) {
    // TODO Merge constants / connections properly
    left.names = left.names.concat(right.names);
    left.connections = left.connections.concat(right.connections);
    left.constants = left.constants.concat(right.constants);
    this.nodes[right.id] = null;
    right.names.forEach(v => {
      this.nodeMap[hashCode(v)] = left.id;
    });
    return left;
  }
  addConnection(
    left: AndGraphNode, right: AndGraphNode, op: CompareExpression['op'],
  ) {
    if (left.id === right.id) return;
    if (op === '=') {
      this.mergeNode(left, right);
    } else {
      left.connections.push({ op, id: right.id });
      right.connections.push({ op: rotateCompareOp(op), id: left.id });
    }
  }
  addConstant(
    node: AndGraphNode, value: Expression, op: CompareExpression['op'],
  ) {
    node.constants.push({ op, value });
  }
  handleCompare(expr: CompareExpression) {
    let leftConstant = isConstant(expr.left);
    let rightConstant = isConstant(expr.right);
    if (!leftConstant && !rightConstant) {
      let leftNode = this.findNode(expr.left);
      let rightNode = this.findNode(expr.right);
      this.addConnection(leftNode, rightNode, expr.op);
    } else if (leftConstant !== rightConstant) {
      let columnExpr = leftConstant ? expr.right : expr.left;
      let constantExpr = leftConstant ? expr.left : expr.right;
      let columnOp = leftConstant ? rotateCompareOp(expr.op) : expr.op;
      let node = this.findNode(columnExpr);
      this.addConstant(node, constantExpr, columnOp);
    } else {
      // Do nothing
    }
  }
  handleLeftover(expr: Expression) {
    this.leftovers.push(expr);
  }
  toJSON(): AndGraphExpression {
    return {
      type: 'custom',
      customType: 'andGraph',
      nodes: this.nodes,
      leftovers: this.leftovers,
    };
  }
}

export default function rewriteGraph(input: Expression) {
  // Recursively descend into AND nodes.
  return rewrite(input, {}, (expr, state) => {
    if (expr.type === 'logical' && expr.op === '&&') {
      let graph = new AndGraphFactory();
      expr.values.forEach((value) => {
        if (value.type === 'compare') {
          graph.handleCompare(value);
        } else {
          graph.handleLeftover(value);
        }
      });
      return {
        expr: graph.toJSON(),
        state,
      };
    }
    return { expr, state };
  });
}
