import { Expression } from 'yasqlp';

import { AndGraphExpression } from './optimize/graph';

/**
 * Rewrites the whole expression tree by recursively descending tree with
 * mapper function.
 */
export function rewrite<T>(
  expr: Expression, state: T,
  mapper: (expr: Expression, state: T) => { expr: Expression, state: T },
): Expression {
  if (expr == null) return expr;
  let { expr: newExpr, state: newState } = mapper(expr, state);
  switch (newExpr.type) {
    case 'logical': {
      let values = newExpr.values.map(v => rewrite(v, newState, mapper));
      if (newExpr.values.some((v, i) => v !== values[i])) {
        return { ...newExpr, values };
      }
      return newExpr;
    }
    case 'unary': {
      let value = rewrite(newExpr.value, newState, mapper);
      if (value !== newExpr.value) {
        return { ...newExpr, value };
      }
      return newExpr;
    }
    case 'compare': {
      let left = rewrite(newExpr.left, newState, mapper);
      let right = rewrite(newExpr.right, newState, mapper);
      if (left !== newExpr.left || right !== newExpr.right) {
        return { ...newExpr, left, right };
      }
      return newExpr;
    }
    case 'between': {
      let min = rewrite(newExpr.min, newState, mapper);
      let max = rewrite(newExpr.max, newState, mapper);
      let target = rewrite(newExpr.target, newState, mapper);
      if (
        min !== newExpr.min || max !== newExpr.max || target !== newExpr.target
      ) {
        return { ...newExpr, min, max, target };
      }
      return newExpr;
    }
    case 'in': {
      // TODO Handle in
      // let values = newExpr.values.map(v => rewrite(v, newState, mapper));
      let target = rewrite(newExpr.target, newState, mapper);
      if (target !== newExpr.target) {
        return { ...newExpr, target };
      }
      return newExpr;
    }
    case 'binary': {
      let left = rewrite(newExpr.left, newState, mapper);
      let right = rewrite(newExpr.right, newState, mapper);
      if (left !== newExpr.left || right !== newExpr.right) {
        return { ...newExpr, left, right };
      }
      return newExpr;
    }
    case 'function': {
      let args = newExpr.args.map(v => rewrite(v, newState, mapper));
      if (newExpr.args.some((v, i) => v !== args[i])) {
        return { ...newExpr, args };
      }
      return newExpr;
    }
    case 'case': {
      let value = rewrite(newExpr.value, newState, mapper);
      let elseVal = rewrite(newExpr.else, newState, mapper);
      let matches = newExpr.matches.map(entry => {
        let query = rewrite(entry.query, newState, mapper);
        let value = rewrite(entry.value, newState, mapper);
        if (query !== entry.query || value !== entry.value) {
          return { query, value };
        }
        return entry;
      });
      if (newExpr.matches.some((v, i) => v !== matches[i]) ||
        value !== newExpr.value || elseVal !== newExpr.else
      ) {
        return { ...newExpr, value, matches, else: elseVal };
      }
      return newExpr;
    }
    case 'custom': {
      if (newExpr.customType === 'andGraph') {
        let andGraph = newExpr as AndGraphExpression;
        let leftovers = andGraph.leftovers.map(
          v => rewrite(v, newState, mapper));
        let nodes = andGraph.nodes.map(node => {
          if (node == null) return node;
          let names = node.names.map(v => rewrite(v, newState, mapper));
          let constraints = node.constraints.map(
            constraint => rewrite(constraint, newState, mapper));
          if (node.names.some((v, i) => v !== names[i]) ||
            node.constraints.some((v, i) => v !== constraints[i])
          ) {
            return { ...node, names, constraints };
          }
          return node;
        });
        if (andGraph.leftovers.some((v, i) => v !== leftovers[i]) ||
          andGraph.nodes.some((v, i) => v !== nodes[i])
        ) {
          return { ...andGraph, leftovers, nodes };
        }
        return andGraph;
      }
    }
    /*
    case 'aggregation':
    case 'exists':
    case 'select':
    case 'string':
    case 'number':
    case 'boolean':
    case 'wildcard':
    case 'column':
    case 'default':
    case 'null':
    */
    default:
      return newExpr;
  }
}
