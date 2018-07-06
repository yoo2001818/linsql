import { Expression, LogicalExpression, UnaryExpression, CompareExpression, BetweenExpression, BinaryExpression, InExpression } from 'yasqlp';
import { Row } from '../row';

export default function compileExpression(
  expression: Expression,
): (row: Row) => any {
  let code = map(expression);
}

function map(expr: Expression): string {
  return MAP_TABLE[expr.type](expr);
}

// TODO Handle aggregations

const MAP_TABLE: { [key: string]: (expr: Expression) => string } = {
  logical: (expr: LogicalExpression) => 
    '(' + expr.values.map(map).join(expr.op) + ')',
  unary: (expr: UnaryExpression) => expr.op + map(expr.value),
  compare: (expr: CompareExpression) =>
    '(' + map(expr.left) + expr.op + map(expr.right) + ')',
  between: (expr: BetweenExpression) =>
    '(' + map(expr.min) + ' < ' + map(expr.target) + ' && ' +
      map(expr.target) + ' < ' + map(expr.max) + ')',
  in: (expr: InExpression) => {
    if (expr.values.type === 'list') {
      return '[' + expr.values.values.map(map).join(', ') +
      '].includes(' + map(expr.target) + ')';
    } else {
      throw new Error('Unsupported table');
    }
  },
  binary: (expr: BinaryExpression) =>
    '(' + map(expr.left) + expr.op + map(expr.right) + ')',
  function: () => {},
  case: () => {},
  string: () => {},
  number: () => {},
  boolean: () => {},
  wildcard: () => {},
  column: () => {},
  default: () => {},
  null: () => {},
};
