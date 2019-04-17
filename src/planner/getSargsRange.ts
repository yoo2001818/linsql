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

export default function findSargsRangeIndex(
  table: NormalTable, index: Index, where: Expression,
): RangeResult {
  // We have to handle more than one columns - therefore, we have to check
  // toset can be fulfilled. If we can't, the leftmost column can be used
  // anyway...
  //
  // Right columns can't be used until left columns are specified using '=',
  // and only rightmost column can use range queries like '>', '<'.
  // Note that we don't have to use all the columns - we still can use
  // range queries when the columns are not used completely.
  function traverseStep(set: RangeSet<any>, expr: Expression): RangeSet<any> {
    switch (expr.type) {
      case 'logical':
        if (expr.op === '&&') {
          return expr.values.reduce(
            (prev, child) => traverseStep(prev, child),
            set);
        } else if (expr.op === '||') {
          // Run two indices and check if they're mergeable - 
        }
        break;
      case 'binary':
        if (expr.left.type === 'column' && expr.left.table === table.name) {
        }
        break;
    }
  }
  traverseStep([], where);
}

export default function findSargsRange(
  table: NormalTable, where: Expression,
) {
  const sets: RangeResult[] = [];
  for (let index of table.indexes) {
    findSargsRangeIndex(table, index, where);
  }
}
