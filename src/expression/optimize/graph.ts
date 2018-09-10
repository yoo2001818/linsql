import { Expression, CompareExpression } from 'yasqlp';

type AndGraphNode = {
  names: ExpressionWithGraph[],
  connections: {
    op: CompareExpression['op'],
    value: ExpressionWithGraph,
  }[],
};

export type AndGraphExpression = {
  type: 'andGraph',
  nodes: AndGraphNode[],
  leftovers: ExpressionWithGraph[],
};

export type ExpressionWithGraph = Expression | AndGraphExpression;

export default function generateGraph(input: Expression) {
  // Recursively descend into AND nodes.

}
