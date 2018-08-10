import { Expression, LogicalExpression, UnaryExpression, CompareExpression,
  BetweenExpression, BinaryExpression, InExpression, StringValue,
  NumberValue, BooleanValue, ColumnValue, AggregateExpression, FunctionExpression, CaseExpression,
} from 'yasqlp';
import { Row } from '../row';
import METHODS from './methods';

type MethodTable = { [key: string]: Function };

type CompileInput = { tables: string[] };

export default function compileExpression(
  tables: string[], expression: Expression,
): (row: Row, parent: Row) => any {
  let result = new Function('methods', 'row', 'parent',
    getCode({ tables }, expression)) as
    (methods: MethodTable, row: Row, parent: Row) => any;
  return result.bind(null, METHODS);
}

export function getCode(compileInput: CompileInput, expression: Expression) {
  return 'return ' + map(compileInput, expression) + ';';
}

function map(compileInput: CompileInput, expr: Expression): string {
  return MAP_TABLE[expr.type](compileInput, expr as any);
}

function escape(str: string): string {
  return str.replace(/'/g, '\\\'');
}

// TODO Handle aggregations

const MAP_TABLE: {
  [key: string]: (compileInput: CompileInput, expr: any) => string
} = {
  logical: (input, expr: LogicalExpression) => 
    '(' + expr.values.map(v => map(input, v)).join(expr.op) + ')',
  unary: (input, expr: UnaryExpression) => expr.op + map(input, expr.value),
  compare: (input, expr: CompareExpression) => {
    // TODO type checking mechanism (1 and '1' is same)
    // TODO LIKE
    switch (expr.op) {
      case 'is':
      case '=':
        return '(' + map(input, expr.left) + ' == ' +
          map(input, expr.right) + ')';
      case 'like':
      case '!=':
      default:
        return '(' + map(input, expr.left) + expr.op +
          map(input, expr.right) + ')';
    }
  },
  between: (input, expr: BetweenExpression) =>
    '(' + map(input, expr.min) + ' <= ' + map(input, expr.target) + ' && ' +
      map(input, expr.target) + ' <= ' + map(input, expr.max) + ')',
  in: (input, expr: InExpression) => {
    if (expr.values.type === 'list') {
      return '[' + expr.values.values.map(v => map(input, v)).join(', ') +
      '].includes(' + map(input, expr.target) + ')';
    } else {
      throw new Error('Unsupported table');
    }
  },
  binary: (input, expr: BinaryExpression) =>
    '(' + map(input, expr.left) + expr.op + map(input, expr.right) + ')',
  function: (input, expr: FunctionExpression) => {
    let name = expr.name.toLowerCase();
    if (!(name in METHODS)) {
      throw new Error('Unknown method ' + name);
    }
    let accessor = `methods['${escape(name)}']`;
    return accessor + '(' + expr.args.map(arg =>
      map(input, arg)).join(', ') + ')';
  },
  aggregation: (input, expr: AggregateExpression) => {
    let name = `row._aggr['${expr.name + '-' +
      escape(map(input, expr.value))}']`;
    // TODO Check validity
    return name;
  },
  case: (input, expr: CaseExpression) => {
    // Create IIFE for the statement
    let code = '(function () {\n';
    if (expr.value != null) code += `var expr = ${map(input, expr.value)};\n`;
    expr.matches.forEach((entry, i) => {
      if (i !== 0) code += 'else ';
      if (expr.value != null) {
        code += `if (expr == ${map(input, entry.query)}) ` +
          `return ${map(input, entry.value)};\n`;
      } else {
        code += `if (${map(input, entry.query)}) ` + 
          `return ${map(input, entry.value)};\n`;
      }
    });
    if (expr.else != null) {
      code += `else return ${map(input, expr.else)};\n`;
    }
    code += '})()';
    return code;
  },
  exists: () => '',
  // TODO Escape string
  string: (_, expr: StringValue) => `'${escape(expr.value)}'`,
  number: (_, expr: NumberValue) => expr.value.toString(),
  boolean: (_, expr: BooleanValue) => expr.value === true ? 'true' : 'false',
  wildcard: () => '*',
  column: (input, expr: ColumnValue) => {
    if (expr.table != null) {
      if (input.tables.includes(expr.table)) {
        return `row['${escape(expr.table)}']['${escape(expr.name)}']`;
      } else {
        return `parent['${escape(expr.table)}']['${escape(expr.name)}']`;
      }
    }
    return `row._output['${escape(expr.name)}']`;
  },
  default: () => '\'_default_\'',
  null: () => 'null',
};
