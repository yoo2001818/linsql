import createRangeSetModule, { RangeSet } from 'range-set';

import { NormalTable } from '../table';

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

export default function findSargsRange(
  table: NormalTable, where: Expression,
) {
  const sets: { [key: string]: RangeSet<any> } = {};
  for (let index of table.indexes) {

  }
}
