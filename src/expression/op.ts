import { CompareExpression, LogicalExpression } from 'yasqlp';

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
