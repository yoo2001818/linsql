import { getRangeNode, traverseNode } from '../../planner/getSargsRange';

import { getWhere } from '../../util/select';

function run(input: string) {
  return traverseNode(getRangeNode('a', getWhere('SELECT * FROM a WHERE ' +
    input + ';')));
}

describe('getSargsRange', () => {
  it('should run correctly', () => {
    expect(run('a.a > 1 AND a.a = 0')).toEqual([]);
    expect(run('a.a > 1 AND a.b = 1')).toEqual([]);
    expect(run('a.a > 1 AND a.a < 5')).toEqual([]);
    expect(run('a.a > 1 AND a.a = 1')).toEqual([]);
  });
  it('should run correctly (or)', () => {
    expect(run('a.a = 1 OR a.a != 1')).toEqual([true]);
    expect(run('a.a = 1 OR a.b = 1')).toEqual([]);
  });
  it('should run correctly (both)', () => {
    expect(run('(a.a = 1 OR a.b = 1) AND a.b = 2')).toEqual([]);
    expect(run('(a.a = 1 OR a.b = 1) AND a.c = 2')).toEqual([]);
  });
  it('should run correctly (cartesian)', () => {
    expect(run('(a.a = 1 OR a.b = 1) AND (a.c = 1 OR a.d = 1) ' +
      'AND (a.e = 1 OR a.f = 1) AND (a.g = 1 OR a.h = 1)')).toEqual([]);
  });
  it('should run correctly (umm)', () => {
    expect(run('a.a > 3 OR (a.a = 3 AND (a.b > 3 OR (a.b = 3 AND a.c >= 3)))'))
      .toEqual([]);
  });
});
