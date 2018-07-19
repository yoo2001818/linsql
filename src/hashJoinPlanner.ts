import { Expression } from 'yasqlp';

type HashJoinPlan = {
  tables: Expression[][][],
  compares: { value: Expression[], tableId: number }[],
};

export default function planHashJoin(
  expr: Expression, left: string[], right: string,
) {
  let plan: HashJoinPlan = { tables: [], compares: [] };
  return planBlock(expr, left, right, plan);
}

function planBlock(
  expr: Expression, left: string[], right: string, plan: HashJoinPlan,
) {
  // exists, logical, unary, compare, between, in, binary,
  // function, case, string, number, boolean, wildcard, column, default, null
  switch (expr.type) {
    case 'logical':
      // AND should add more columns to the existing tables if possible
      // OR should add more compares
      break;
    case 'unary':
      // Give up if this happens
      break;
    case 'compare':
      // See if each side has left or right table, and create compares
      break;
    case 'between':
    case 'in':
      // This must be not present
    case 'binary':
    case 'function':
    case 'case':
      // If only one side's columns are present, this is still valid
    case 'string':
    case 'number':
    case 'boolean':
    case 'default':
    case 'null':
      // noop
    case 'wildcard':
      // ?
    case 'column':
      // Compare the side of this expression
  }
}
