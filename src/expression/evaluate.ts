import { Expression } from 'yasqlp';

import { Row } from '../row';

export default function evaluate(expr: Expression, row?: Row) {
  switch (expr.type) {
    case 'logical':
      switch (expr.op) {
        case '&&':
        case '||':
      }
      return;
    case 'unary':
      switch (expr.op) {
        case '!':
        case '~':
        case '-':
      }
      return;
    case 'compare':
      return;
    case 'between':
      return;
    case 'in':
      return;
    case 'binary':
      switch (expr.op) {
        case '<<':
        case '>>':
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
        case '^':
      }
    case 'function':
    case 'case':
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
