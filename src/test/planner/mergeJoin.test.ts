import parse, { OrderByRef, Expression } from 'yasqlp';
import planMergeJoin from '../../planner/mergeJoin';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select statement');
}

function getOrderBy(code: string): OrderByRef[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.order;
  throw new Error('Given statement is not select statement');
}

describe('mergeJoinPlanner', () => {
  it('should handle simple cases', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.a = b.b;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC;'),
      getOrderBy('SELECT 1 ORDER BY b.b;')
    ))
      .toEqual({ start: 0, end: 1 });
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.a = 1;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC;'),
      getOrderBy('SELECT 1 ORDER BY b.b;')
    ))
      .toEqual({ start: 0, end: 0 });
  });
  it('should ignore when order is different', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.a = b.b;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC;'),
      getOrderBy('SELECT 1 ORDER BY b.b DESC;')
    ))
      .toEqual({ start: 0, end: 0 });
  });
  it('should ignore unknown table', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE c.a = d.b;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC;'),
      getOrderBy('SELECT 1 ORDER BY b.b DESC;')
    ))
      .toEqual({ start: 0, end: 0 });
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.a = d.b;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC;'),
      getOrderBy('SELECT 1 ORDER BY b.b DESC;')
    ))
      .toEqual({ start: 0, end: 0 });
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE b.a = d.b;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC;'),
      getOrderBy('SELECT 1 ORDER BY b.b DESC;')
    ))
      .toEqual({ start: 0, end: 0 });
  });
  it('should handle AND cases', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE b.a = a.a AND a.b = b.b;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC, a.b DESC;'),
      getOrderBy('SELECT 1 ORDER BY b.a, b.b DESC;')
    ))
      .toEqual({ start: 0, end: 2 });
  });
  it('should handle incorrect AND cases', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.a = b.a AND a.b = b.a;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC, a.b DESC;'),
      getOrderBy('SELECT 1 ORDER BY b.a, b.b DESC;')
    ))
      .toEqual({ start: 0, end: 1 });
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.a = b.b AND a.b = b.b;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a ASC, a.b DESC;'),
      getOrderBy('SELECT 1 ORDER BY b.a, b.b DESC;')
    ))
      .toEqual({ start: 0, end: 0 });
  });
  it('should handle multiple AND cases', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.a = b.a AND a.b = b.b AND a.c = b.c;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.c, a.a ASC, a.b DESC;'),
      getOrderBy('SELECT 1 ORDER BY b.c, b.a, b.b DESC;')
    ))
      .toEqual({ start: 0, end: 3 });
  });
  it('should ignore other expressions', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE NOT(a.b = b.b) AND a.a = b.a;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a, a.b;'),
      getOrderBy('SELECT 1 ORDER BY b.a, b.b;')
    ))
      .toEqual({ start: 0, end: 1 });
  });
  it('should ignore OR cases', () => {
    expect(planMergeJoin(
      getWhere('SELECT 1 WHERE a.b = b.b OR a.a = b.a;'),
      ['a'], ['b'],
      getOrderBy('SELECT 1 ORDER BY a.a, a.b;'),
      getOrderBy('SELECT 1 ORDER BY b.a, b.b;')
    ))
      .toEqual({ start: 0, end: 0 });
  });
});
