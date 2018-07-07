import { Expression, LogicalExpression, UnaryExpression, CompareExpression, BetweenExpression, BinaryExpression, InExpression, StringValue, NumberValue, BooleanValue, ColumnValue } from 'yasqlp';
import { Row } from '../row';

export default function compileExpression(
  expression: Expression,
): (row: Row) => any {
  let code = 'return ' + map(expression) + ';';
  return new Function('row', code) as (row: Row) => any;
}

function map(expr: Expression): string {
  return MAP_TABLE[expr.type](expr as any);
}

// TODO Handle aggregations

const MAP_TABLE: { [key: string]: (expr: any) => string } = {
  logical: (expr: LogicalExpression) => 
    '(' + expr.values.map(map).join(expr.op) + ')',
  unary: (expr: UnaryExpression) => expr.op + map(expr.value),
  compare: (expr: CompareExpression) => {
    // TODO type checking mechanism (1 and '1' is same)
    // TODO LIKE
    switch (expr.op) {
      case 'is':
        return '(' + map(expr.left) + ' == ' + map(expr.right) + ')';
      case 'like':
      case '==':
      case '!=':
      default:
        return '(' + map(expr.left) + expr.op + map(expr.right) + ')';
    }
  },
  between: (expr: BetweenExpression) =>
    '(' + map(expr.min) + ' <= ' + map(expr.target) + ' && ' +
      map(expr.target) + ' <= ' + map(expr.max) + ')',
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
  // TODO Check if it's aggregation, then report to the planner
  function: () => '',
  case: () => '',
  // TODO Escape string
  string: (expr: StringValue) => '"' + expr.value + '"',
  number: (expr: NumberValue) => expr.value.toString(),
  boolean: (expr: BooleanValue) => expr.value === true ? 'true' : 'false',
  wildcard: () => '*',
  column: (expr: ColumnValue) => {
    if (expr.table != null) return `row['${expr.table}']['${expr.name}']`;
    return `row._output['${expr.name}']`;
  },
  default: () => '"default"',
  null: () => 'null',
};
