import InputIterator from '../../iterator/input';

import drainIterator from '../../util/drainIterator';

describe('InputIterator', () => {
  let iter: InputIterator;
  beforeEach(() => {
    iter = new InputIterator('abc', [
      { a: 'test', b: 'abc' }, { a: 'abc', b: 'test' }, { a: '123', b: '555' },
    ]);
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
});
