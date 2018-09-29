import { Expression } from 'yasqlp';

import methods from './methods';
import { Row } from '../row';

function isTruthy(value: any) {
  return value === true;
}

// TODO Use expression for this
export default function evaluate(expr: Expression, row?: Row): any {
  switch (expr.type) {
    case 'logical':
      switch (expr.op) {
        case '&&':
          return expr.values.every(v => isTruthy(evaluate(v, row)));
        case '||':
          return expr.values.some(v => isTruthy(evaluate(v, row)));
      }
      return;
    case 'unary':
      switch (expr.op) {
        case '!':
          return !isTruthy(evaluate(expr.value, row));
        case '~':
          return ~evaluate(expr.value, row);
        case '-':
          return -evaluate(expr.value, row);
      }
      return;
    case 'compare': {
      let left = evaluate(expr.left, row);
      let right = evaluate(expr.right, row);
      switch (expr.op) {
        case '=':
          return left == right;
        case '!=':
          return left != right;
        case '<':
          return left < right;
        case '>':
          return left > right;
        case '<=':
          return left <= right;
        case '>=':
          return left >= right;
        case 'is':
          return left == right;
        case 'like':
          return left == right;
      }
      return;
    }
    case 'between': {
      let min = evaluate(expr.min, row);
      let max = evaluate(expr.max, row);
      let target = evaluate(expr.target, row);
      return min <= target && target <= max;
    }
    case 'in': {
      let target = evaluate(expr.target, row);
      if (expr.values.type === 'list') {
        return expr.values.values.some(v => evaluate(v, row) == target);
      } else {
        // Not supported in any way
        return;
      }
    }
    case 'binary': {
      let left = evaluate(expr.left, row);
      let right = evaluate(expr.right, row);
      switch (expr.op) {
        case '<<':
          return left << right;
        case '>>':
          return left >> right;
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '%':
          return left % right;
        case '^':
          return left ^ right;
      }
      return;
    }
    case 'function': {
      let method = methods[expr.name];
      if (method == null) {
        throw new Error('Unknown method ' + expr.name);
      }
      return method.apply(null, expr.args.map(v => evaluate(v, row)));
    }
    case 'case': {
      // TODO
    }
    case 'custom':
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
    default:
  }
}
