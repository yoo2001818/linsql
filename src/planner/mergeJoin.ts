import deepEqual from 'deep-equal';
import { Expression, OrderByRef, ColumnValue } from 'yasqlp';

type MergeJoinInput = {
  left: string[],
  right: string[],
  leftOrder: OrderByRef[],
  rightOrder: OrderByRef[],
};

export type MergeJoinPlan = {
  start: number,
  end: number,
};

// Merge join can be used when all following conditions are true:
// 1. Only AND expression must be present for = expression's parent node
// 2. Only = expression can be used. (Technically, the last criteria in the
//    index can be used for ranges, but to simplify it, it's not allowed)
// 3. The index order between left and right tables must match
// 4. There must be nothing before, or in between index orders
// Combining 3 and 4, we can actually consider corresponding pair as
// two tuples, and only allow merge join when both tuple matches, or one 
// completely includes another.
// Thus, to check if merge join is possible, do the following:
// 1. check each criteria's corresponding index order. If it doesn't match, 
//    it can't be used.
// 2. Lower index can't be used if upper index is not used yet.
//    [a, b, c, d]
//     |  |  |  |
//     |  +--|--+-- Unused
//     |     |
//     +-----+----- Used
//    In this, only 'a' can be used for merge join.

export default function planMergeJoin(
  expr: Expression, left: string[], right: string[],
  leftOrder: OrderByRef[], rightOrder: OrderByRef[],
) {
  let result = planBlock(expr, { left, right, leftOrder, rightOrder });
  // Find leftmost / rightmost available index of result
  return {
    start: 0,
    end: result.findIndex(v => v === false),
  };
}

function planBlock(
  expr: Expression, input: MergeJoinInput,
): boolean[] {
  if (expr.type === 'logical' && expr.op === '&&') {
    // Combine all values
    let results = expr.values.map((v) => planBlock(v, input));
    return input.leftOrder.map((_, i) => {
      return results.some(v => v[i] === true);
    });
  } else if (expr.type === 'compare' && expr.op === '=') {
    // Both left and right must exactly be a column.
    if (expr.left.type !== 'column' || expr.right.type !== 'column') return [];
    // Left and right values must depend on each table.
    let leftTableVal: ColumnValue;
    let rightTableVal: ColumnValue;
    if (input.left.includes(expr.left.table)) {
      if (!input.right.includes(expr.right.table)) return [];
      leftTableVal = expr.left;
      rightTableVal = expr.right;
    } else if (input.right.includes(expr.left.table)) {
      if (!input.left.includes(expr.right.table)) return [];
      leftTableVal = expr.right;
      rightTableVal = expr.left;
    } else {
      return [];
    }
    // Get index of corresponding value..
    let leftIndex = input.leftOrder.findIndex(v => deepEqual(v, leftTableVal));
    let rightIndex = input.rightOrder.findIndex(v =>
      deepEqual(v, rightTableVal));
    if (leftIndex === -1 || leftIndex !== rightIndex) {
      // Index order must match for left and right
      return [];
    }
    // Return an array with current index marked true
    return input.leftOrder.map((_, i) => i === leftIndex);
  } else {
    // Only = or && is allowed, return nothing in this case
    return [];
  }
}
