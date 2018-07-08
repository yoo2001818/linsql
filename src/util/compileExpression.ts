import { Expression, LogicalExpression, UnaryExpression, CompareExpression,
  BetweenExpression, BinaryExpression, InExpression, StringValue,
  NumberValue, BooleanValue, ColumnValue, AggregateExpression, FunctionExpression, CaseExpression,
} from 'yasqlp';
import { Row } from '../row';

export default function compileExpression(
  expression: Expression,
): (row: Row) => any {
  return new Function('row', getCode(expression)) as (row: Row) => any;
}

export function getCode(expression: Expression) {
  return 'return ' + map(expression) + ';';
}

function map(expr: Expression): string {
  return MAP_TABLE[expr.type](expr as any);
}

function escape(str: string): string {
  return str.replace(/'/g, '\\\'');
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
      case '=':
        return '(' + map(expr.left) + ' == ' + map(expr.right) + ')';
      case 'like':
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
  function: (expr: FunctionExpression) => {
    let name = `namespace['${escape(expr.name)}']`;
    // TODO Check validity
    return name + '(' + expr.args.map(arg => map(arg)).join(',') + ')';
  },
  aggregation: (expr: AggregateExpression) => {
    let name = `row._aggr['${expr.name + '-' + escape(map(expr.value))}']`;
    // TODO Check validity
    return name;
  },
  case: (expr: CaseExpression) => {
    // Create IIFE for the statement
    let code = '(function () {\n';
    if (expr.value != null) code += `var expr = ${map(expr.value)};\n`;
    expr.matches.forEach((entry, i) => {
      if (i !== 0) code += 'else ';
      if (expr.value != null) {
        code += `if (expr == ${map(entry.query)}) ` +
          `return ${map(entry.value)};\n`;
      } else {
        code += `if (${map(entry.query)}) return ${map(entry.value)};\n`;
      }
    });
    if (expr.else != null) {
      code += `else return ${map(expr.else)};\n`;
    }
    code += '})()';
    return code;
  },
  exists: () => '',
  // TODO Escape string
  string: (expr: StringValue) => `'${escape(expr.value)}'`,
  number: (expr: NumberValue) => expr.value.toString(),
  boolean: (expr: BooleanValue) => expr.value === true ? 'true' : 'false',
  wildcard: () => '*',
  column: (expr: ColumnValue) => {
    if (expr.table != null) {
      return `row['${escape(expr.table)}']['${escape(expr.name)}']`;
    }
    return `row._output['${escape(expr.name)}']`;
  },
  default: () => '\'_default_\'',
  null: () => 'null',
};
