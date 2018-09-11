import { Expression, CompareExpression } from 'yasqlp';

import { rewrite } from '../traverse';

type AndGraphNode = {
  names: Expression[],
  connections: {
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

export default function generateGraph(input: Expression) {
  // Recursively descend into AND nodes.
  return rewrite(input, {}, (expr, state) => {
    if (expr.type === 'logical' && expr.op === '&&') {
      let nodes: AndGraphNode[] = [];
      let leftovers: Expression[] = [];
      expr.values.forEach((value) => {

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
