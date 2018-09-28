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
      /**
       * We need to perform a lot of operations to rescue those poor SARGable
       * expressions - we need to exploit bunch of algebra properties to
       * make them right.
       * If the expression is changed by any level of modifier, it should be
       * rerun from the start (it may lead to infinite loop though.)
       * 1. If the expression is constant, evaluate it right away.
       *    - a + 5 * 2 -> a + 10
       * 2. Expand all the columns using distributive property - this will allow
       *    columns to appear at the root level.
       *    - (a + 3) * 5 = 3 -> a * 5 + 3 * 5 = 3
       * 3. If the same column appears multiple times, it can be reduced to 
       *    appear only once, effectively becoming SARG.
       *    This should only apply in append -> multiply order, the other
       *    doesn't apply at all.
       *    - a * 2 - a * 1 = 0 -> a = 0
       *    - a + 3 - a + 5 = 0 -> 8 = 0 -> FALSE
       *    - (a + 2) * (a + 3) -> This shouldn't be applied at all.
       * 4. If the expression is identity function, convert them to raw entry.
       *    - a * 1 + (a - 0) = 0 -> a + a = 0
       * 5. Push all constants, or any other insignificant columns to the right.
       *    This will require inverting the direction of expression.
       *    'Insignificant' column can be decided randomly.
       *    - a + 5 = 0 -> a = -5.
       */
      // TODO Write stuff...
    }
    return { expr, state };
  });
}
