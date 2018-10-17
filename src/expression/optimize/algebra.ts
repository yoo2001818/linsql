import { Expression, BinaryExpression } from 'yasqlp';

import { rewrite, rewritePostOrder } from '../traverse';
import { isConstant, rotateCompareOp } from '../op';
import evaluate, { castBool } from '../evaluate';
import hashCode from '../../util/hashCode';

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

// This is expected to run when the value has a possiblity to be changed to have
// evaluatable portion.
export function rewriteEvaluate(expr: Expression): Expression {
  // If the given expression is constant, just evaluate it right away.
  if (canEvaluate(expr)) {
    return valueToExpr(evaluate(expr));
  }
  return expr;
}

export function extractBinaryExpr(
  expr: Expression,
  normalOp: BinaryExpression['op'],
  invertedOp: BinaryExpression['op'],
) {
  let result: { inverted: boolean, expr: Expression }[] = [];
  function step(expr: Expression, inverted: boolean): void {
    if (expr.type !== 'binary') {
      result.push({ inverted, expr });
      return;
    };
    if (expr.op === normalOp) {
      step(expr.left, inverted);
      return step(expr.right, inverted);
    } else if (expr.op === invertedOp) {
      step(expr.left, inverted);
      return step(expr.right, !inverted);
    } else {
      result.push({ inverted, expr });
      return;
    }
  }
  step(expr, false);
  return result;
}

export function generateBinaryExpr(
  list: { inverted: boolean, expr: Expression }[],
  normalOp: BinaryExpression['op'],
  invertedOp: BinaryExpression['op'],
): Expression {
  if (list.length === 0) return { type: 'number', value: 0 };
  return list.reduce((left: Expression, { inverted, expr }): Expression => {
    if (left == null) {
      if (!inverted) return expr;
      if (invertedOp === '/') {
        return {
          type: 'binary', op: '/', left: valueToExpr(1), right: expr,
        };
      } else if (invertedOp === '-') {
        return {
          type: 'unary', op: '-', value: expr,
        };
      }
    }
    return {
      type: 'binary',
      op: inverted ? invertedOp : normalOp,
      left,
      right: expr,
    };
  }, null);
}

type BinaryExprFactorItem = {
  expr: Expression,
  factor: number,
  constant?: boolean,
};

export function extractBinaryExprFactor(
  expr: Expression,
): BinaryExprFactorItem[] {
  return extractBinaryExpr(expr, '+', '-').map(value => {
    if (canEvaluate(value.expr)) {
      return {
        expr: value.expr,
        factor: value.inverted ? -1 : 1,
        constant: true,
      };
    }
    let expr = value.expr;
    let factor = 1;
    if (expr.type === 'binary') {
      const { left, right } = expr;
      if (expr.op === '*' && left.type === 'number') {
        expr = expr.right;
        factor = left.value;
      } else if (expr.op === '*' && right.type === 'number') {
        expr = expr.left;
        factor = right.value;
      } else if (expr.op === '/' && right.type === 'number') {
        expr = expr.left;
        factor = 1 / right.value;
      } else {
        expr = expr;
      }
    }
    if (expr.type === 'unary' && expr.op === '-') {
      factor = -1;
      expr = expr.value;
    }
    if (value.inverted) factor = -factor;
    return { expr, factor, constant: false };
  });
}

export function generateBinaryExprFactor(
  list: BinaryExprFactorItem[],
) {
  return generateBinaryExpr(list.map(v => {
    const { factor, expr } = v;
    if (factor === 0) return null;
    if (factor === 1) return { inverted: false, expr: expr };
    if (factor === -1) return { inverted: true, expr: expr };
    let factorDividible = (1 / Math.abs(factor) % 1) === 0;
    return {
      inverted: factor < 0,
      expr: {
        type: 'binary',
        op: factorDividible ? '/' : '*',
        left: expr,
        right: valueToExpr(factorDividible ?
          1 / Math.abs(factor) : Math.abs(factor)),
      } as Expression,
    };
  }).filter(v => v != null), '+', '-');
}

// TODO This will be run repeatedly for each expression; There should be some
// kind of cutoff? that prohibits this behavior.
export function rewriteCollapse(expr: Expression): Expression {
  // This should distinguish constant / columns and collapse them in the
  // same arithmetic operators.
  // (a * 5) * 2 -> a * 10
  // a * 5 + 3 + a * 2 + b * 3 + 4 + a * b * 2 -> a * 7 + b * 3 + a * b * 2 + 7
  // a + b - a + b + 3 + 7 -> 2 * b + 10
  // As you can see, if multiple columns appears, they should be distinguished
  // from each other (a, b, a * b), and they should be collapsed if
  // they appear multiple times.
  // Note that a * b and b * a treated differently as column - it should be
  // rearranged before reaching this function.
  // Constants are extracted and collapsed and put in the back.
  // This only applies for + or - having * or -, however.
  if (expr.type !== 'binary') return expr;
  // * and /'s columns can't be collapsed, but they can still be collapsed
  // when they use constants.
  // First, extract all expressions inside same level. This requires recursively
  // walking into the expression.
  // Note that while (1 + 2) + 3 = 1 + (2 + 3), but (1 - 2) - 3 != 1 - (2 - 3).
  // We MUST take this into account while extracting. Well, it can be easily
  // solved by wrapping them by unary operators, so 1 - 2 becomes 1 + (-2).
  // This applies same to /. 1 / 2 becomes 1 * (1 / 2).
  // a / (b * c * d) becomes a * (1 / b) * (1 / c) * (1 / d).
  if (expr.op === '*' || expr.op === '/') {
    let values = extractBinaryExpr(expr, '*', '/');
    let constants = values.filter(v => canEvaluate(v.expr));
    let nonConstants = values.filter(v => !canEvaluate(v.expr));
    if (constants.length <= 1) return expr;
    let factor = evaluate(generateBinaryExpr(constants, '*', '/'));
    let factorDividible = (1 / factor % 1) === 0;
    let constantsExpr = {
      inverted: factorDividible,
      expr: valueToExpr(factorDividible ? 1 / factor : factor),
    };
    return generateBinaryExpr(nonConstants.concat([constantsExpr]), '*', '/');
  } else if (expr.op === '+' || expr.op === '-') {
    let values = extractBinaryExprFactor(expr);
    let constants = values.filter(v => v.constant);
    let nonConstants = values.filter(v => !v.constant);
    if (constants.length > 0) {
      let result = evaluate(generateBinaryExpr(
        constants.map(v => ({ ...v, inverted: v.factor < 0 })), '+', '-'));
      nonConstants.push({
        expr: valueToExpr(result < 0 ? -result : result),
        factor: result < 0 ? -1 : 1,
        constant: true,
      });
    }
    let exprList: { expr: Expression, hash: number }[] = [];
    let exprMap: { [hash: number]: number } = {};
    nonConstants.forEach(arg => {
      let { expr, factor } = arg;
      let hash = hashCode(expr);
      if (exprMap[hash] == null) {
        exprList.push({ expr, hash });
        exprMap[hash] = factor;
      } else {
        exprMap[hash] += factor;
      }
    });
    return generateBinaryExprFactor(exprList.map(
      v => ({ expr: v.expr, factor: exprMap[v.hash] })));
  }
  return expr;
}

export function rewriteExpand(expr: Expression): Expression {
  // If the expression can be expanded, expand it.
  // Expansion is only possible for * and / operators, that has bunch of
  // + and - operators.
  // Since * and /, + and - has to be groupped for this stage too
  // (we need to determine if it's possible for multiple operators),
  // expansion and collapsing should be done at the same time.
  // (a + 3) * 5 * 2 -> (* (+ a 3) 5 2) -> (+ (* a 5 2) (* 3 5 2))
  // (a + 3) * b * c -> a * b * c + 3 * b * c
  if (expr.type !== 'binary') return expr;
  if (!['*', '/'].includes(expr.op)) return expr;
  // *: Either left or right can be + or -, and it can be repetitively done.
  // /: Only left can be + or -.
  let leftAdd = expr.left.type === 'binary' &&
    ['+', '-'].includes(expr.left.op);
  let rightAdd = expr.right.type === 'binary' &&
    ['+', '-'].includes(expr.right.op);
  if (leftAdd === rightAdd) return expr;
  if (expr.op === '/' && rightAdd) return expr;
  let binaryTarget = leftAdd ? expr.left : expr.right;
  let unaryTarget = leftAdd ? expr.right : expr.left;
  // TODO Remove unnecessary assertion
  if (binaryTarget.type !== 'binary') return expr;
  return {
    type: 'binary',
    op: binaryTarget.op,
    left: rewriteCollapse(rewriteIdentity(rewriteExpand(rewriteEvaluate({
      type: 'binary',
      op: expr.op,
      left: binaryTarget.left,
      right: unaryTarget,
    })))),
    right: rewriteCollapse(rewriteIdentity(rewriteExpand(rewriteEvaluate({
      type: 'binary',
      op: expr.op,
      left: binaryTarget.right,
      right: unaryTarget,
    })))),
  };
}

export function rewriteConstant(expr: Expression): Expression {
  return rewritePostOrder(expr, expr => {
    // If the given expression is constant, just evaluate it right away.
    if (canEvaluate(expr)) {
      return valueToExpr(evaluate(expr));
    }
    // If the expression is an identity function, remove it.
    let identExpr = rewriteIdentity(expr);
    // If the expression can be expanded and it is beneificial to do so,
    // expand them using distributive property.
    // - (a + 3) * 5 -> a * 5 + 15
    let expandExpr = rewriteExpand(identExpr);
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
    let collapseExpr = rewriteCollapse(expandExpr);
    return collapseExpr;
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
  return rewritePostOrder(expr, expr => {
    if (expr.type === 'compare') {
      /**
       * We need to perform a lot of operations to rescue those poor SARGable
       * expressions - we need to exploit bunch of algebra properties to
       * make them right.
       * 
       * Thankfully, almost all work is done by rewriteConstant - we just have
       * to reorder them correctly.
       * 
       * We just have to...
       * 1. Push all constants, or any other insignificant columns to the right.
       *    This requires inverting the direction of expression.
       *    a + b = 0 -> a = -b
       *    a - 52 -> a = 52
       * 2. Remove any factor from the left side. This can be achieved
       *    by dividing both side by left side's factor.
       *    This, of course, includes unary - too.
       *    a / 3 = 6 -> a = 6 * 3
       *    a * 3 = 9 -> a = 9 / 3
       * 3. Evaluate right side, if necessary.
       */
      // We have to treat all expressions as addition expression, as it's
      // expected for simple algebra expressions to have shape like
      // (a * b) + (c * d) + ...
      let leftValues = extractBinaryExprFactor(expr.left);
      let rightValues = extractBinaryExprFactor(expr.right);
      // Choose what to leave on the left side. This can be selected
      // randomly, but 'whole' column, like `a`, not like COALESCE(a, b), should
      // be prefered.
      // Check if there is a column first.
      let values = leftValues.concat(rightValues);
      let chosenValue = values.find(v => v.expr.type === 'column');
      // If not, just choose any non-evaluatable value.
      if (chosenValue == null) {
        chosenValue = values.find(v => !canEvaluate(v.expr));
      }
      // Still no? ... it means that the whole compare expression can be
      // evaluated.
      if (chosenValue == null) return valueToExpr(evaluate(expr));
      let chosenHash = hashCode(chosenValue.expr);
      // Then, move everything else to right, by inverting its factor.
      let newLeft: BinaryExprFactorItem[] = [];
      let newRight: BinaryExprFactorItem[] = [];
      leftValues.forEach(value => {
        let hash = hashCode(value.expr);
        if (hash === chosenHash) {
          newLeft.push(value);
        } else {
          newRight.push({ ...value, factor: -value.factor });
        }
      });
      rightValues.forEach(value => {
        let hash = hashCode(value.expr);
        if (hash === chosenHash) {
          newLeft.push({ ...value, factor: -value.factor });
        } else {
          newRight.push(value);
        }
      });
      // Finally, merge them.
    }
    return expr;
  });
}
