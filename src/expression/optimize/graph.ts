import { Expression, CompareExpression } from 'yasqlp';
import cloneDeep from 'lodash.clonedeep';

import { rotateCompareOp, isColumn } from '../op';
import { rewrite } from '../traverse';
import hashCode from '../../util/hashCode';

type AndGraphNode = {
  id: number,
  names: Expression[],
  connections: {
    op: CompareExpression['op'],
    id: number,
  }[],
  constraints: Expression[],
};

type AndGraphInternalNode = {
  id: number,
  names: Expression[],
  connections: {
    op: CompareExpression['op'],
    expr: Expression,
  }[],
  constraints: Expression[],
};

export type AndGraphExpression = {
  type: 'custom',
  customType: 'andGraph',
  nodes: AndGraphNode[],
  leftovers: Expression[],
};

export class AndGraphFactory {
  nodes: AndGraphInternalNode[];
  leftovers: Expression[];
  nodeMap: { [key: number]: number };
  constructor() {
    this.nodes = [];
    this.leftovers = [];
    this.nodeMap = {};
  }
  createNode() {
    let node: AndGraphInternalNode = {
      id: this.nodes.length,
      names: [],
      connections: [],
      constraints: [],
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
  mergeNode(left: AndGraphInternalNode, right: AndGraphInternalNode) {
    // TODO Merge constants / connections properly.
    left.names = left.names.concat(right.names);
    left.connections = left.connections.concat(right.connections);
    left.constraints = left.constraints.concat(right.constraints);
    this.nodes[right.id] = null;
    right.names.forEach(v => {
      this.nodeMap[hashCode(v)] = left.id;
    });
    return left;
  }
  addConnection(
    left: AndGraphInternalNode, right: AndGraphInternalNode,
    op: CompareExpression['op'],
  ) {
    if (left.id === right.id) return;
    if (op === '=') {
      this.mergeNode(left, right);
    } else {
      left.connections.push({ op, expr: right.names[0] });
      right.connections.push({ op: rotateCompareOp(op), expr: left.names[0] });
    }
  }
  addConstraint(node: AndGraphInternalNode, expr: Expression) {
    node.constraints.push(expr);
  }
  handleCompare(expr: CompareExpression) {
    // Connection can be eliminated if the same operators show up twice.
    // Constants can be eliminated using ordered set notation.
    // If a < 3 AND b < a, we can be sure b < 3. However, this is so tricky
    // it should be done later.
    let leftCol = isColumn(expr.left);
    let rightCol = isColumn(expr.right);
    if (leftCol && rightCol) {
      let leftNode = this.findNode(expr.left);
      let rightNode = this.findNode(expr.right);
      this.addConnection(leftNode, rightNode, expr.op);
    } else if (leftCol !== rightCol) {
      let columnExpr = leftCol ? expr.left : expr.right;
      let node = this.findNode(columnExpr);
      this.addConstraint(node, expr);
    } else {
      this.handleLeftover(expr);
    }
  }
  handleLeftover(expr: Expression) {
    this.leftovers.push(expr);
  }
  process(expr: Expression) {
    // There are four types of express which alters the state of the graph - 
    // 1. column = column - Directly creates equality group and merges two
    //    equality groups.
    // 2. column >= column - Adds connection edge.
    // 3. column = constant - Adds constraint edge.
    // 4. constant - Adds leftover item.
    // Any other actions can be performed without any problem, but merging is
    // too expensive - it needs to reorder IDs - which involves traversing
    // every edge in every node.
    // Or, we can just store expression for connections, and rebind them while
    // building JSON.
  }
  toJSON(): AndGraphExpression {
    return {
      type: 'custom',
      customType: 'andGraph',
      nodes: this.nodes.map(node => ({
        ...node,
        connections: node.connections.map(connection => ({
          op: connection.op,
          id: this.nodeMap[hashCode(connection.expr)],
        })),
      })),
      leftovers: this.leftovers,
    };
  }
  clone(): AndGraphFactory {
    let cloned = new AndGraphFactory();
    cloned.nodes = cloneDeep(this.nodes);
    cloned.leftovers = this.leftovers.slice();
    cloned.nodeMap = { ...this.nodeMap };
    // Shouldn't it be better to do CoW?
    return cloned;
  }
}

export default function rewriteGraph(input: Expression) {
  // Recursively descend into AND nodes.
  return rewrite(input, { parent: null }, (expr, state) => {
    if (expr.type === 'logical' && expr.op === '&&') {
      let graph: AndGraphFactory;
      if (state.parent != null) {
        graph = state.parent.clone();
      } else {
        graph = new AndGraphFactory();
      }
      graph.process(expr);
      return {
        expr: graph.toJSON(),
        state: { parent: graph },
      };
    }
    return { expr, state };
  });
}
