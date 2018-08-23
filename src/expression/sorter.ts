import { OrderByRef } from 'yasqlp';
import { Row } from '../row';
import compileExpression from '../expression';

export default function compileSorter(tables: string[], order: OrderByRef[]) {
  // Compile each evaluators
  let directions = order.map(ref => ref.direction === 'desc');
  let evaluators = order.map(ref => compileExpression(tables, ref.value));
  return (parentRow: Row, a: Row, b: Row) => {
    for (let i = 0; i < evaluators.length; ++i) {
      let evaluator = evaluators[i];
      let resultA = evaluator(a, parentRow);
      let resultB = evaluator(b, parentRow);
      if (directions[i]) {
        if (resultA > resultB) return -1;
        if (resultA < resultB) return 1;
      } else {
        if (resultA < resultB) return -1;
        if (resultA > resultB) return 1;
      }
    }
    return 0;
  };
}

export function compileJoinSorter(
  leftTables: string[], leftOrder: OrderByRef[],
  rightTables: string[], rightOrder: OrderByRef[],
) {
  let directions = leftOrder.map(ref => ref.direction === 'desc');
  let leftEvals = leftOrder.map(ref =>
    compileExpression(leftTables, ref.value));
  let rightEvals = rightOrder.map(ref =>
    compileExpression(rightTables, ref.value));
  return (parentRow: Row, left: Row, right: Row) => {
    for (let i = 0; i < leftEvals.length; ++i) {
      let resultA = leftEvals[i](left, parentRow);
      let resultB = rightEvals[i](right, parentRow);
      if (directions[i]) {
        if (resultA > resultB) return -1;
        if (resultA < resultB) return 1;
      } else {
        if (resultA < resultB) return -1;
        if (resultA > resultB) return 1;
      }
    }
    return 0;
  };
}
