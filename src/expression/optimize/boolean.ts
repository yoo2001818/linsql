import { Expression } from 'yasqlp';

// Boolean logic optimizer

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

/**
 * Rewrites between expression to two comparsion operators, and in expression
 * to many comparsion operators. 
 * @param expr The expression to remove between and in.
 */
export function rewriteBetweenIn(expr: Expression) {
  return rewrite(expr, {}, (expr, state) => {
    switch (expr.type) {
      case 'between': {
        return {
          expr: {
            type: 'logical',
            op: '&&',
            values: [{
              type: 'compare',
              op: '<=',
              left: expr.min,
              right: expr.target,
            }, {
              type: 'compare',
              op: '<=',
              left: expr.target,
              right: expr.max,
            }],
          },
          state,
        };
      }
      case 'in': {
        if (expr.values.type === 'select') return { expr, state };
        return {
          expr: {
            type: 'logical',
            op: '||', 
            values: expr.values.values.map(v => ({
              type: 'compare',
              op: '=',
              left: expr.target,  
              right: v,
            })) as Expression[],
          },
          state,
        };
      }
      default: {
        return { expr, state };
      }
    }
  });
}

/**
 * Moves NOT to bottom of the tree to simplify the logical operators.
 * @param expr The expression to rewrite NOT.
 */
const LOGICAL_INVERSES = { '&&': '||' as '||', '||': '&&' as '&&' };
const COMPARE_INVERSES = {
  '=': '!=' as '!=',
  '!=': '=' as '=',
  '>=': '<' as '<',
  '<=': '>' as '>',
  '>': '<=' as '<=',
  '<': '>=' as '>=',
  'is': false as false,
  'like': false as false,
};

type RewriteNotState = { inversed: boolean, bottom: boolean };

function mapRewriteNot(
  expr: Expression, state: RewriteNotState,
): { expr: Expression, state: RewriteNotState } {
  if (state.bottom) {
    return { expr, state: { inversed: false, bottom: false } };
  }
  if (expr.type === 'unary' && expr.op === '!') {
    return mapRewriteNot(
      expr.value, { inversed: !state.inversed, bottom: false });
  }
  if (state.inversed) {
    switch (expr.type) {
      case 'logical': {
        return { expr: { ...expr, op: LOGICAL_INVERSES[expr.op] }, state };
      }
      case 'compare': {
        let newOp = COMPARE_INVERSES[expr.op];
        if (newOp === false) {
          return {
            expr: { type: 'unary', op: '!', value: expr },
            state: { inversed: false, bottom: true },
          };
        } else {
          return {
            expr: { ...expr, op: newOp },
            state: { inversed: false, bottom: true },
          };
        }
      }
      case 'boolean': {
        return {
          expr: { ...expr, value: !expr.value },
          state: { inversed: false, bottom: true },
        };
      }
      case 'number': {
        return {
          expr: { type: 'boolean', value: !expr.value },
          state: { inversed: false, bottom: true },
        };
      }
      default: {
        return {
          expr: { type: 'unary', op: '!', value: expr },
          state: { inversed: false, bottom: true },
        };
      }
    }
  } else {
    return { expr, state };
  }
}

export function rewriteNot(expr: Expression) {
  return rewrite(expr, { inversed: false, bottom: false }, mapRewriteNot);
}
