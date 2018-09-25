import { Expression } from 'yasqlp';

import { rewrite } from '../traverse';
import { isConstant, rotateCompareOp } from '../op';

// Algebra / compare logic optimizer

/**
 * Rewrites '3 < a' expression into 'a > 3'. This should also be applied for
 * 'modified' columns so `3 = FLOOR(a)` should be rewrited as well.
 * @param expr The expression to reverse compare column.
 */
export function rewriteCompareColumn(expr: Expression) {
  return rewrite(expr, {}, (expr, state) => {
    if (expr.type === 'compare') {
      if (!isConstant(expr.left) && isConstant(expr.right)) {
        return {
          expr: {
            ...expr,
            left: expr.right,
            right: expr.left,
          },
          state: {},
        };
      }
    }
    return { expr, state };
  });
}

/**
 * Rewrites non-trivial SARGable expression into trivial one - e.g.
 * `a + 5 = 3` into `a = -2`. This should be able to:
 * - Interpret constant expression at optimization time. (We could compile
 *   and evaluate that, or emulate that)
 * - Move expresion to the other end if it's possible to do so.
 * - Unwrap expression if it's considered to be useful.
 * As you can see, this is completely non-trivial and requires some effort.
 * @param expr The expression to convert to SARGs if possible.
 */
export function rewriteSargable(expr: Expression) {
  return rewrite(expr, {}, (expr, state) => {
    if (expr.type === 'compare') {
      // TODO Write stuff...
    }
    return { expr, state };
  });
}
