import { rangeSet, negativeInfinity, getRangeNode, traverseNode }
  from '../../planner/getSargsRange';

import { getWhere } from '../../util/select';

function run(input: string) {
  return traverseNode(getRangeNode('a', getWhere('SELECT * FROM a WHERE ' +
    input + ';')));
}

describe('getSargsRange', () => {
  it('should run correctly', () => {
    expect(run('a.a > 1 AND a.a = 0')).toEqual([]);
    expect(run('a.a > 1 AND a.b = 1')).toEqual([
      { a: rangeSet.gt([1]), b: rangeSet.eq([1]) },
    ]);
    expect(run('a.a > 1 AND a.a < 5')).toEqual([
      { a: rangeSet.range([1], [5]) },
    ]);
    expect(run('a.a > 1 AND a.a = 1')).toEqual([]);
  });
  it('should run correctly (or)', () => {
    expect(run('a.a = 1 OR a.a != 1')).toEqual([
      { a: rangeSet.gt([negativeInfinity]) },
    ]);
    expect(run('a.a = 1 OR a.b = 1')).toEqual([
      { a: rangeSet.eq([1]) },
      { b: rangeSet.eq([1]) },
    ]);
  });
  it('should run correctly (both)', () => {
    expect(run('(a.a = 1 OR a.b = 1) AND a.b = 2')).toEqual([
        { a: rangeSet.eq([1]), b: rangeSet.eq([2]) },
    ]);
    expect(run('(a.a = 1 OR a.b = 1) AND a.c = 2')).toEqual([
        { a: rangeSet.eq([1]), c: rangeSet.eq([2]) },
        { b: rangeSet.eq([1]), c: rangeSet.eq([2]) },
    ]);
  });
  it('should run correctly (cartesian)', () => {
    expect(run('(a.a = 1 OR a.b = 1) AND (a.c = 1 OR a.d = 1)')).toEqual([
        { a: rangeSet.eq([1]), c: rangeSet.eq([1]) },
        { a: rangeSet.eq([1]), d: rangeSet.eq([1]) },
        { b: rangeSet.eq([1]), c: rangeSet.eq([1]) },
        { b: rangeSet.eq([1]), d: rangeSet.eq([1]) },
    ]);
  });
  it('should run correctly (chain)', () => {
    expect(run('a.a > 3 OR (a.a = 3 AND (a.b > 3 OR (a.b = 3 AND a.c >= 3)))'))
      .toEqual([
        { a: rangeSet.gt([3]) },
        { a: rangeSet.eq([3]), b: rangeSet.gt([3]) },
        { a: rangeSet.eq([3]), b: rangeSet.eq([3]), c: rangeSet.gte([3]) },
      ]);
  });
  it('should run correctly (not null)', () => {
    expect(run('a.a > 1 OR a.a <= 1 OR a.a IS NULL')).toEqual([true]);
  });
});
