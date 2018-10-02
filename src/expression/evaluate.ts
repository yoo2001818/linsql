import { Expression } from 'yasqlp';

import methods from './methods';
import { Row } from '../row';
import { AndGraphExpression } from './optimize/graph';

function castString(value: any): string | null {
  if (value == null) {
    return null;
  } else {
    return value.toString();
  }
}

function castNumber(value: any): number | null {
  if (value == null) {
    return null;
  } else if (typeof value === 'number') {
    return value;
  } else {
    let float = parseFloat(value);
    if (isNaN(float)) return 0;
    return float;
  }
}

function castBool(value: any): boolean | null {
  if (value == null) {
    return null;
  } else if (typeof value === 'boolean') {
    return value;
  } else {
    // This is weird, but.... this is what SQL wants do.
    // This also applies to all comparision operator.
    return castNumber(value) !== 0;
  }
}

function compareEq(left: any, right: any): boolean | null {
  if (left == null || right == null) {
    return null;
  } else if (left === right) {
    return true;
  } else if (typeof left === 'number' && typeof right === 'number') {
    return castNumber(left) === castNumber(right);
  } else {
    return castString(left) === castString(right);
  }
}

// TODO Use expression for this
export default function evaluate(expr: Expression, row?: Row): any {
  switch (expr.type) {
    case 'logical':
      switch (expr.op) {
        case '&&':
          return expr.values.every(v => castBool(evaluate(v, row)));
        case '||':
          return expr.values.some(v => castBool(evaluate(v, row)));
      }
      return;
    case 'unary': {
      let value = evaluate(expr.value, row);
      if (value == null) return null;
      switch (expr.op) {
        case '!':
          return !castBool(value);
        case '~':
          return ~castNumber(value);
        case '-':
          return -castNumber(value);
      }
      return;
    }
    case 'compare': {
      let left = evaluate(expr.left, row);
      let right = evaluate(expr.right, row);
      if (expr.op === 'is') {
        return (left == null) === (right == null);
      } else {
        if (left == null || right == null) return null;
        switch (expr.op) {
          case '=':
            return compareEq(left, right);
          case '!=':
            return !compareEq(left, right);
          case '<':
            return left < right;
          case '>':
            return left > right;
          case '<=':
            return left <= right;
          case '>=':
            return left >= right;
          case 'like':
            return left == right;
        }
      }
      return;
    }
    case 'between': {
      let min = evaluate(expr.min, row);
      let max = evaluate(expr.max, row);
      let target = evaluate(expr.target, row);
      if (min == null || max == null || target == null) return null;
      return min <= target && target <= max;
    }
    case 'in': {
      let target = evaluate(expr.target, row);
      if (target == null) return null;
      if (expr.values.type === 'list') {
        return expr.values.values.some(
          v => compareEq(evaluate(v, row), target));
      } else {
        // Not supported in any way
        return;
      }
    }
    case 'binary': {
      let left = castNumber(evaluate(expr.left, row));
      let right = castNumber(evaluate(expr.right, row));
      if (left == null || right == null) return null;
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
      if (expr.value != null) {
        let value = evaluate(expr.value, row);
        let match = expr.matches.find(
          v => compareEq(value, evaluate(v.query, row)));
        if (match != null) return evaluate(match.value, row);
        if (expr.else != null) return evaluate(expr.else, row);
        return null;
      } else {
        let match = expr.matches.find(
          v => castBool(evaluate(v.query, row)));
        if (match != null) return evaluate(match.value, row);
        if (expr.else != null) return evaluate(expr.else, row);
        return null;
      }
    }
    case 'custom': {
      switch (expr.customType) {
        case 'andGraph': {
          let andGraph = expr as AndGraphExpression;
          let representers = andGraph.nodes.map(v =>
            evaluate(v.names[0], row));
          let nodePassed = andGraph.nodes.every((node, i) => {
            let representer = representers[i];
            // Validate if all name equals
            if (!node.names.slice(1)
              .every(v => compareEq(representer, evaluate(v, row)))
            ) {
              return false;
            }
            // Validate if connection matches
            node.connections.every(v => {});
          });
          andGraph.leftovers
        }
        default:
          throw new Error('Unhandled expression type');
      }
    }
    case 'aggregation':
    case 'exists':
    case 'select':
      // We can't do anything in this case
      return null;
    case 'string':
    case 'number':
    case 'boolean':
      return expr.value;
    case 'wildcard':
    case 'default':
    case 'null':
      return null;
    case 'column':
      return row[expr.table][expr.name];
    default:
      throw new Error('Unhandled expression type');
  }
}
