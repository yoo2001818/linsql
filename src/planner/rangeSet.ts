import createRangeSetModule from 'range-set';

export const positiveInfinity = Symbol('+Infinity');
export const negativeInfinity = Symbol('-Infinity / null');

export type IndexValue = (
  | string
  | number
  | boolean
  | symbol
)[];

export function compare(a: IndexValue, b: IndexValue) {
  for (let i = 0; i < a.length; i += 1) {
    const aValue = a[i];
    const bValue = b[i];
    if (aValue === positiveInfinity && bValue === positiveInfinity) continue;
    if (aValue === positiveInfinity) return 1;
    if (bValue === positiveInfinity) return -1;
    if (aValue === negativeInfinity && bValue === negativeInfinity) continue;
    if (aValue === negativeInfinity) return -1;
    if (bValue === negativeInfinity) return 1;
    if (typeof aValue === 'symbol' || typeof bValue === 'symbol') {
      throw new Error('Unexpected symbol');
    }
    if (typeof aValue !== typeof bValue) {
      throw new Error('Uncomparable type');
    }
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }
  return 0;
}

export const rangeSetDescriptor = {
  // Even though this is compared using > and <, each value must consist of
  // same type.
  compare,
  isPositiveInfinity: (v: IndexValue) => v[0] === positiveInfinity,
  isNegativeInfinity: (v: IndexValue) => v[0] === negativeInfinity,
  positiveInfinity: [positiveInfinity as typeof positiveInfinity],
  negativeInfinity: [negativeInfinity as typeof negativeInfinity],
};

export const rangeSet = createRangeSetModule(rangeSetDescriptor);
