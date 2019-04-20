import { Expression } from 'yasqlp';
import createRangeSetModule, { RangeSet } from 'range-set';

import { NormalTable, Index } from '../table';

const numberSet = createRangeSetModule({
  compare: (a: number, b: number) => a - b,
  isPositiveInfinity: (v: number) => v === Infinity,
  isNegativeInfinity: (v: number) => v === -Infinity,
  positiveInfinity: Infinity,
  negativeInfinity: -Infinity,
});

const stringPositiveInfinity = Symbol('+Infinity');
const stringNegativeInfinity = Symbol('-Infinity');

const stringSet = createRangeSetModule({
  compare: (a: string, b: string) => {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  },
  isPositiveInfinity: (v: any) => v === stringPositiveInfinity,
  isNegativeInfinity: (v: any) => v === stringNegativeInfinity,
  positiveInfinity: stringPositiveInfinity,
  negativeInfinity: stringNegativeInfinity,
});

interface RangeResult {
  name: string,
  set: RangeSet<any>,
}

export default function findSargsRange(
  name: string, table: NormalTable, where: Expression,
) {
  const sets: RangeResult[] = [];

  let columns: { [name: string]: RangeSet<any> } = {};
  // We have to handle more than one columns, to be exact, N 'equal' columns
  // and one range columns.
  //
  // Right columns can't be used until left columns are specified using '=',
  // and only rightmost column can use range queries like '>', '<'.
  // Note that we don't have to use all the columns - we still can use
  // range queries when the columns are not used completely.
  //
  // However, there is one exception - a expression can be converted to one
  // range scan.
  // a > 3 OR (a = 3 AND b > 5)
  // a >= 3 AND (a > 3 OR b > 5)
  // ...both can be converted into ((3, 5) ... inf), for (a, b) index.
  // 
  // First one is pretty straightforward - since both ranges are inside (a, b)
  // index's range, they just have to merged together.
  // Second one can be a little tricky to derive the ranges. a >= 3 is easy
  // to derive, however, (a > 3 OR b > 5) requires the prior knowledge of
  // a >= 3. 
  function traverseStep(expr: Expression) {
    switch (expr.type) {
      case 'logical':
        if (expr.op === '&&') {
          expr.values.forEach(child => traverseStep(child));
        } else if (expr.op === '||') {
          // Run two indices and check if they're mergeable - 
        }
        break;
      case 'binary':
        if (expr.left.type === 'column' && expr.left.table === name) {
          if (expr.right.type === 'number') {
            columns[expr.left.name] = numberSet.and(
              columns[expr.left.name] || [],
              numberSet.gt(expr.right.value),
            );
          }
        }
        if (expr.right.type === 'column' && expr.right.table === name) {
          if (expr.left.type === 'number') {
            columns[expr.right.name] = numberSet.and(
              columns[expr.right.name] || [],
              numberSet.gt(expr.left.value),
            );
          }
        }
        break;
    }
  }
  traverseStep(where);
}
