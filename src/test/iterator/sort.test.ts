import parse, { OrderByRef } from 'yasqlp';

import InputIterator from '../../iterator/input';
import SortIterator from '../../iterator/sort';
import RowIterator from '../../iterator/type';

import drainIterator from '../../util/drainIterator';

function getOrderBy(code: string): OrderByRef[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.order;
  throw new Error('Given statement is not select statement');
}

describe('SortIterator', () => {
  let iterInput: RowIterator;
  let iter: RowIterator;
  beforeEach(() => {
    iterInput = new InputIterator('abc', [
      { a: 'test', b: 1 },
      { a: 'uv', b: 25 },
      { a: 'test', b: 5 },
      { a: 'test', b: 2 },
      { a: 'uv', b: 5 },
    ]);
  });
  it('should return right result', async () => {
    iter = new SortIterator(iterInput, getOrderBy(
      'SELECT 1 ORDER BY abc.a ASC, abc.b DESC;'));
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 5 } },
      { abc: { a: 'test', b: 2 } },
      { abc: { a: 'test', b: 1 } },
      { abc: { a: 'uv', b: 25 } },
      { abc: { a: 'uv', b: 5 } },
    ]);
  });
  it('should be rewindable', async () => {
    iter = new SortIterator(iterInput, getOrderBy(
      'SELECT 1 ORDER BY abc.a ASC, abc.b DESC;'));
    await drainIterator(iter);
    iter.rewind();
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 5 } },
      { abc: { a: 'test', b: 2 } },
      { abc: { a: 'test', b: 1 } },
      { abc: { a: 'uv', b: 25 } },
      { abc: { a: 'uv', b: 5 } },
    ]);
  });
  it('should be rewindable with parent row', async () => {
    iter = new SortIterator(iterInput, getOrderBy(
      'SELECT 1 ORDER BY abc.b * parent.a ASC, abc.a ASC;'));
    iter.rewind({ parent: { a: 1 } });
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 1 } },
      { abc: { a: 'test', b: 2 } },
      { abc: { a: 'test', b: 5 } },
      { abc: { a: 'uv', b: 5 } },
      { abc: { a: 'uv', b: 25 } },
    ]);
    iter.rewind({ parent: { a: -1 } });
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'uv', b: 25 } },
      { abc: { a: 'test', b: 5 } },
      { abc: { a: 'uv', b: 5 } },
      { abc: { a: 'test', b: 2 } },
      { abc: { a: 'test', b: 1 } },
    ]);
  });
  it('should return order if specified', async () => {
    iter = new SortIterator(iterInput, getOrderBy(
      'SELECT 1 ORDER BY abc.a ASC, abc.b DESC;'));
    expect(iter.getOrder()).toEqual(getOrderBy(
      'SELECT 1 ORDER BY abc.a ASC, abc.b DESC;'));
  });
});
