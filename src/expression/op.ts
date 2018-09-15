import { CompareExpression, LogicalExpression, Expression,
  ColumnValue, ExistsExpression, SelectStatement,  } from 'yasqlp';

const LOGICAL_INVERSES = {
  '&&': '||' as '||',
  '||': '&&' as '&&',
};

export function invertLogicalOp(
  op: LogicalExpression['op'],
): LogicalExpression['op'] | false {
  return LOGICAL_INVERSES[op];
}

const COMPARE_INVERSES = {
  '=': '!=' as '!=',
  '!=': '=' as '=',
  '>=': '<' as '<',
  '<=': '>' as '>',
  '>': '<=' as '<=',
  '<': '>=' as '>=',
  'is': false as false,
  'like': false as false,
};

export function invertCompareOp(
  op: CompareExpression['op'],
): CompareExpression['op'] | false {
  return COMPARE_INVERSES[op];
}

const COMPARE_REVERSES = {
  '=': '=' as '=',
  '!=': '!=' as '!=',
  '>=': '<=' as '<=',
  '<=': '>=' as '>=',
  '>': '<' as '<',
  '<': '>' as '>',
  'is': 'is' as 'is',
  'like': 'like' as 'like',
};

export function rotateCompareOp(
  op: CompareExpression['op'],
): CompareExpression['op'] {
  return COMPARE_REVERSES[op];
}

export function getDependencies(
  expr: Expression,
): (ColumnValue | SelectStatement)[] {
  switch (expr.type) {
    case 'logical':
      return Array.prototype.concat.apply([], 
        expr.values.map(v => getDependencies(v)));
    case 'unary':
      return getDependencies(expr.value);
    case 'compare':
      return [
        ...getDependencies(expr.left),
        ...getDependencies(expr.right),
      ];
    case 'between':
      return [
        ...getDependencies(expr.min),
        ...getDependencies(expr.target),
        ...getDependencies(expr.max),
      ];
    case 'in':
      if (expr.values.type === 'list') {
        return Array.prototype.concat.apply([], [
          getDependencies(expr.target),
          ...expr.values.values.map(v => getDependencies(v)),
        ]);
      } else {
        return [
          ...getDependencies(expr.target),
          ...getDependencies(expr.values),
        ];
      }
    case 'binary':
      return [
        ...getDependencies(expr.left),
        ...getDependencies(expr.right),
      ];
    case 'function':
      return Array.prototype.concat.apply([], 
        expr.args.map(v => getDependencies(v)));
    case 'case':
      // TODO
    case 'aggregation':
      // TODO
    case 'exists':
      return getDependencies(expr.value);
    case 'column':
      return [expr];
    case 'wildcard':
    case 'default':
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
      return [];
    case 'select':
      // TODO
  }
}

export function isConstant(expr: Expression): boolean {
  return getDependencies(expr).length === 0;
}
