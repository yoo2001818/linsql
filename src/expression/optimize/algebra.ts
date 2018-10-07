import { Expression, BinaryExpression } from 'yasqlp';

import { rewrite, rewritePostOrder } from '../traverse';
import { isConstant, rotateCompareOp } from '../op';
import evaluate, { castBool } from '../evaluate';

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

function isValue(expr: Expression) {
  return ['string', 'number', 'boolean', 'null'].includes(expr.type);
}

function valueToExpr(value: any): Expression {
  if (typeof value === 'string') {
    return { type: 'string', value };
  } else if (typeof value === 'number') {
    return { type: 'number', value };
  } else if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  } else {
    return { type: 'null' };
  }
}

function canEvaluate(expr: Expression) {
  switch (expr.type) {
    case 'logical':
      return expr.values.every(v => isValue(v));
    case 'unary':
      return isValue(expr.value);
    case 'compare':
      return isValue(expr.left) && isValue(expr.right);
    case 'between':
      return isValue(expr.min) && isValue(expr.max) && isValue(expr.target);
    case 'in':
      return isValue(expr.target) && expr.values.type === 'list' &&
        expr.values.values.every(v => isValue(v));
    case 'binary':
      return isValue(expr.left) && isValue(expr.right);
    case 'function':
      return expr.args.every(v => isValue(v));
    case 'case':
      // TODO
    case 'custom':
      // TODO
    case 'aggregation':
      return false;
    case 'exists':
      return false;
    case 'select':
      return false;
    case 'wildcard':
    case 'default':
    case 'column':
      return false;
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
      return true;
    default:
      return true;
  }
}

function castExprToBool(expr: Expression, defaultValue: boolean) {
  switch (expr.type) {
    case 'null':
      return false;
    case 'boolean':
    case 'number':
    case 'string':
      return castBool(expr.value);
    default:
      return defaultValue;
  }
}

function extractIdentity(
  expr: BinaryExpression, check: (value: Expression) => boolean,
) {
  if (check(expr.left)) {
    return expr.right;
  } else if (check(expr.right)) {
    return expr.left;
  } else {
    return null;
  }
}

/**
 * Rewrites identity expressions so it can be simplified.
 * @param expr The expression to remove identity functions.
 */
export function rewriteIdentity(expr: Expression): Expression {
  if (expr.type === 'binary') {
    switch (expr.op) {
      case '+':
      case '-':
      case '^': {
        let extracted = extractIdentity(expr,
          v => v.type === 'number' && v.value === 0);
        if (extracted != null) return extracted;
        return expr;
      }
      case '*': {
        let extracted = extractIdentity(expr,
          v => v.type === 'number' && v.value === 1);
        if (extracted != null) return extracted;
        let extractedMinus = extractIdentity(expr,
          v => v.type === 'number' && v.value === -1);
        if (extractedMinus != null) {
          return { type: 'unary', op: '-', value: extractedMinus };
        }
        let extractedZero = extractIdentity(expr,
          v => v.type === 'number' && v.value === 0);
        if (extractedZero != null) return { type: 'number', value: 0 };
        return expr;
      }
      case '/': {
        if (expr.left.type === 'number' && expr.left.value === 0) {
          // TODO NaN check
          return expr.left;
        } else if (expr.right.type === 'number' && expr.right.value === 1) {
          return expr.left;
        } else if (expr.right.type === 'number' && expr.right.value === -1) {
          return { type: 'unary', op: '-', value: expr.left };
        } else {
          return expr;
        }
      }
    }
  } else if (expr.type === 'logical') {
    // For AND, remove all TRUE and convert itself to FALSE if FALSE is detected
    // For OR, remove all FALSE and convert itself to TRUE if TRUE is detected.
    switch (expr.op) {
      case '&&': {
        let hasFalse = expr.values.find(v => 
          !castExprToBool(v, true));
        if (hasFalse) return hasFalse;
        let newValues = expr.values.filter(v => !castExprToBool(v, false));
        if (newValues.length === 1) return newValues[0];
        if (newValues.length === 0) return { type: 'boolean', value: true };
        return { ...expr, values: newValues };
      }
      case '||': {
        let hasTrue = expr.values.find(v => castExprToBool(v, false));
        if (hasTrue) return hasTrue;
        let newValues = expr.values.filter(v => castExprToBool(v, true));
        if (newValues.length === 1) return newValues[0];
        if (newValues.length === 0) return { type: 'boolean', value: false };
        return { ...expr, values: newValues };
      }
    }
  }
  return expr;
}

export function rewriteConstant(expr: Expression): Expression {
  return rewritePostOrder(expr, (expr) => {
    // If the given expression is constant, just evaluate it right away.
    if (canEvaluate(expr)) {
      return valueToExpr(evaluate(expr));
    }
    // If the expression is an identity function, remove it.
    let identExpr = rewriteIdentity(expr);
    // If the expression can be collapsed, e.g.
    // - a * 3 + a * 1 -> a * 4
    // - 6 * 3 + a * 3 + 4 * 5 -> 38 + a * 3
    // - a - a -> 0
    // - a + a -> 2 * a
    // we need to collapse it. This can be tricky, and binary expressions only
    // having left and right nodes doesn't help at all. (we need to group them
    // in here)
    // Basically, this boils down to:
    // - Grouping expressions to single operator with list of values,
    //   to reorder them inside.
    //   - Converting - and / to 1 + (-1) and 3 * (1 / 3).
    //   - Recursively fetching all child values.
    // - Grouping all constants and merging them to one.
    // - Merging and factoring all non-constants (use hash codes to distinguish
    //   them.)
    //   - (a [* /] 3) [+ -] a
    //   - (a [* /] 3) [+ -] (a [* /] 1)
    //   - a [+ -] a
    return identExpr;
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