import { Expression } from 'yasqlp';

import { invertCompareOp, invertLogicalOp } from '../op';
import { rewrite } from '../traverse';

// Boolean logic optimizer
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

type RewriteNotState = { inversed: boolean, bottom: boolean };

function mapRewriteNot(
  expr: Expression, state: RewriteNotState,
): { expr: Expression, state: RewriteNotState } {
  if (expr.type === 'unary' && expr.op === '!') {
    return mapRewriteNot(
      expr.value, { inversed: !state.inversed, bottom: false });
  }
  if (state.bottom) {
    return { expr, state: { inversed: false, bottom: false } };
  }
  if (state.inversed) {
    switch (expr.type) {
      case 'logical': {
        let newOp = invertLogicalOp(expr.op);
        if (newOp === false) {
          return {
            expr: { type: 'unary', op: '!', value: { ...expr } },
            state,
          };
        } else {
          return { expr: { ...expr, op: newOp }, state };
        }
      }
      case 'compare': {
        let newOp = invertCompareOp(expr.op);
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
