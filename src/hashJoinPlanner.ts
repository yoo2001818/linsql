import { Expression } from 'yasqlp';

type HashJoinPlan = {
  tables: Expression[][][],
  compares: { value: Expression[], tableId: number }[],
  leftDepends: boolean,
  rightDepends: boolean,
  left: string[],
  right: string[],
};

export default function planHashJoin(
  expr: Expression, left: string[], right: string[],
) {
  let plan: HashJoinPlan = {
    tables: [],
    compares: [],
    leftDepends: false,
    rightDepends: false,
    left,
    right,
  };
  return planBlock(expr, plan);
}

// In order to use hash lookup, we need to be sure that hash lookup's result
// ends in truthy (conditionals in NOT can't be used for hash lookup)
// However, even if hash lookup doesn't end up TRUE every time, it should be
// used anyway.
// But, if there are any matching rows that doesn't get fetched by hash lookup,
// it's not possible to use hash lookup, so use cross join then.
// (If histogram shows that exclusion hash lookup is faster, it can use hash
// join, but since we don't have histogram, let's just use cross join)

function planBlock(expr: Expression, plan: HashJoinPlan): HashJoinPlan {
  switch (expr.type) {
    case 'logical':
      if (expr.op === '&&') {
        // AND should add more columns to the existing tables if possible
      } else if (expr.op === '||') {
        // OR should add more compares
      }
      break;
    case 'compare': {
      // See if each side has left or right table, and create hash table
      let leftPlan = planBlock(expr.left, plan);
      let rightPlan = planBlock(expr.right, plan);
      let isHashable = leftPlan.leftDepends !== rightPlan.leftDepends &&
        leftPlan.rightDepends !== rightPlan.rightDepends;
      if (isHashable && expr.op === '=') {
        let leftDepender = leftPlan.leftDepends ? expr.left : expr.right;
        let rightDepender = leftPlan.rightDepends ? expr.left : expr.right;
        // Create new hash table.
        let tables = [[[rightDepender]]];
        let compares = [{ value: [leftDepender], tableId: 0 }];
        return {
          ...plan,
          tables,
          compares,
          leftDepends: leftPlan.leftDepends || rightPlan.leftDepends,
          rightDepends: leftPlan.rightDepends || rightPlan.rightDepends,
        };
      } else {
        // TODO Ascend plan
        return {
          ...plan,
          leftDepends: leftPlan.leftDepends || rightPlan.leftDepends,
          rightDepends: leftPlan.rightDepends || rightPlan.rightDepends,
        };
      }
    }
    case 'between':
    case 'in':
    case 'aggregation':
      // This must be not present
    case 'unary':
      // ??
    case 'binary': {
      let leftPlan = planBlock(expr.left, plan);
      let rightPlan = planBlock(expr.right, plan);
      // TODO Ascend plan
      return {
        ...plan,
        leftDepends: leftPlan.leftDepends || rightPlan.leftDepends,
        rightDepends: leftPlan.rightDepends || rightPlan.rightDepends,
      };
    }
    case 'function': {
    }
    case 'case': {
      // If only one side's columns are present, this is still valid
    }
    case 'string':
    case 'number':
    case 'boolean':
    case 'default':
    case 'null':
    case 'wildcard':
      return plan;
    case 'column': {
      if (plan.left.includes(expr.table)) {
        return { ...plan, leftDepends: true };
      } else if (plan.right.includes(expr.table)) {
        return { ...plan, rightDepends: true };
      }
      return plan;
    }
  }
}
