import parse, { OrderByRef } from 'yasqlp';

import InputIterator from '../../iterator/input';

import drainIterator from '../../util/drainIterator';

function getOrderBy(code: string): OrderByRef[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.order;
  throw new Error('Given statement is not select statement');
}

describe('InputIterator', () => {
  let iter: InputIterator;
  beforeEach(() => {
    iter = new InputIterator('abc', [
      { a: 'test', b: 'abc' }, { a: 'abc', b: 'test' }, { a: '123', b: '555' },
    ], ['a']);
  });
  it('should wrap rows in names', async () => {
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 'abc' } },
      { abc: { a: 'abc', b: 'test' } },
      { abc: { a: '123', b: '555' } },
    ]);
  });
  it('should limit resulting rows', async () => {
    expect(await iter.next(1)).toEqual({
      done: false,
      value: [{ abc: { a: 'test', b: 'abc' } }],
    });
  });
  it('should return schema', async () => {
    expect(await iter.getColumns()).toEqual({
      abc: ['a', 'b'],
    });
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 'abc' } },
      { abc: { a: 'abc', b: 'test' } },
      { abc: { a: '123', b: '555' } },
    ]);
  });
  it('should be iterable', async () => {
    let count = 0;
    for await (let value of iter) {
      count += value.length;
    }
    expect(count).toBe(3);
  });
  it('should be rewindable', async () => {
    await drainIterator(iter);
    iter.rewind();
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 'abc' } },
      { abc: { a: 'abc', b: 'test' } },
      { abc: { a: '123', b: '555' } },
    ]);
  });
  it('should return order if specified', async () => {
    expect(iter.getOrder()).toEqual(getOrderBy('SELECT 1 ORDER BY abc.a;'));
  });
});
