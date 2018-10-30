import { Expression,
  SelectStatement, SelectBasicStatement, SelectUnionStatement } from 'yasqlp';

import { AndGraphExpression } from './optimize/graph';

function traverseStep(expr: Expression, map: (expr: Expression) => Expression) {
 switch (expr.type) {
    case 'logical': {
      let values = expr.values.map(map);
      if (expr.values.some((v, i) => v !== values[i])) {
        return { ...expr, values };
      }
      return expr;
    }
    case 'unary': {
      let value = map(expr.value);
      if (value !== expr.value) {
        return { ...expr, value };
      }
      return expr;
    }
    case 'compare': {
      let left = map(expr.left);
      let right = map(expr.right);
      if (left !== expr.left || right !== expr.right) {
        return { ...expr, left, right };
      }
      return expr;
    }
    case 'between': {
      let min = map(expr.min);
      let max = map(expr.max);
      let target = map(expr.target);
      if (
        min !== expr.min || max !== expr.max || target !== expr.target
      ) {
        return { ...expr, min, max, target };
      }
      return expr;
    }
    case 'in': {
      // TODO Handle in
      // let values = expr.values.map(v => rewrite(v, newState, mapper));
      let target = map(expr.target);
      if (target !== expr.target) {
        return { ...expr, target };
      }
      return expr;
    }
    case 'binary': {
      let left = map(expr.left);
      let right = map(expr.right);
      if (left !== expr.left || right !== expr.right) {
        return { ...expr, left, right };
      }
      return expr;
    }
    case 'function': {
      let args = expr.args.map(map);
      if (expr.args.some((v, i) => v !== args[i])) {
        return { ...expr, args };
      }
      return expr;
    }
    case 'case': {
      let value = map(expr.value);
      let elseVal = map(expr.else);
      let matches = expr.matches.map(entry => {
        let query = map(entry.query);
        let value = map(entry.value);
        if (query !== entry.query || value !== entry.value) {
          return { query, value };
        }
        return entry;
      });
      if (expr.matches.some((v, i) => v !== matches[i]) ||
        value !== expr.value || elseVal !== expr.else
      ) {
        return { ...expr, value, matches, else: elseVal };
      }
      return expr;
    }
    case 'aggregation': {
      let value = expr.value;
      if (value !== expr.value) {
        return { ...expr, value };
      }
      return expr;
    }
    case 'exists': {
      let value = expr.value;
      if (value !== expr.value) {
        return { ...expr, value };
      }
      return expr;
    }
    case 'select': {
      let columns = expr.columns.map(entry => {
        let value = map(entry.value);
        if (value !== entry.value) {
          return { ...entry, value };
        }
        return entry;
      });
      let where = map(expr.where);
      let groupBy = expr.groupBy && expr.groupBy.map(v => map(v));
      let having = map(expr.having);
      let order: SelectBasicStatement['order'] = null;
      let unions: SelectBasicStatement['unions'] = null;
      if (!('unionType' in expr)) {
        order = expr.order && expr.order.map(entry => {
          let value = map(entry.value);
          if (value !== entry.value) {
            return { ...entry, value };
          }
          return entry;
        });
        unions = expr.unions &&
          expr.unions.map(v => map(v) as SelectUnionStatement);
      }
      if (
        expr.columns.some((v, i) => v !== columns[i]) ||
        where !== expr.where ||
        (expr.groupBy && expr.groupBy.some((v, i) => v !== groupBy[i])) ||
        having !== expr.having ||
        (!('unionType' in expr) && (
          (expr.order && expr.order.some((v, i) => v !== order[i])) ||
          (expr.unions && expr.unions.some((v, i) => v !== unions[i]))
        ))
      ) {
        return {
          ...expr,
          columns,
          where,
          groupBy,
          having,
          ...('unionType' in expr) ? {
            order,
            unions,
          } : {},
        };
      }
      return expr;
    }
    case 'custom': {
      if (expr.customType === 'andGraph') {
        let andGraph = expr as AndGraphExpression;
        let leftovers = andGraph.leftovers.map(map);
        let nodes = andGraph.nodes.map(node => {
          if (node == null) return node;
          let names = node.names.map(map);
          let constraints = node.constraints.map(map);
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
    case 'string':
    case 'number':
    case 'boolean':
    case 'wildcard':
    case 'column':
    case 'default':
    case 'null':
    */
    default:
      return expr;
  }
}

/**
 * Rewrites the whole expression tree by recursively descending tree with
 * mapper function.
 * This traverses the tree in pre-order.
 */
export function rewrite<T>(
  expr: Expression, state: T,
  mapper: (expr: Expression, state: T) => { expr: Expression, state: T },
): Expression {
  if (expr == null) return expr;
  let { expr: newExpr, state: newState } = mapper(expr, state);
  return traverseStep(newExpr, expr => rewrite(expr, newState, mapper));
}

/**
 * Rewrites the whole expression tree by recursively descending tree with
 * mapper function.
 * This traverses the tree in post-order.
 */
export function rewritePostOrder<T>(
  expr: Expression,
  mapper: (expr: Expression) => Expression,
): Expression {
  let newExpr = traverseStep(expr, expr => rewritePostOrder(expr, mapper));
  return mapper(newExpr);
}
