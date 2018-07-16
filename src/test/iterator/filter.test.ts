import parse, { Expression } from 'yasqlp';

import InputIterator from '../../iterator/input';
import FilterIterator from '../../iterator/filter';
import RowIterator from '../../iterator/type';

import drainIterator from '../../util/drainIterator';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select stement');
}

describe('FilterIterator', () => {
  let iter: RowIterator;
  beforeEach(() => {
    iter = new InputIterator('abc', [
      { a: 'test', b: 1 }, { a: 'abc', b: 3 }, { a: 'test', b: 3 },
    ], ['b']);
    iter = new FilterIterator(iter, getWhere(
      'SELECT 1 WHERE abc.a = \'test\' AND abc.b IN (1, 3);'));
  });
  it('should return right result', async () => {
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 1 } },
      { abc: { a: 'test', b: 3 } },
    ]);
  });
  it('should be rewindable', async () => {
    await drainIterator(iter);
    iter.rewind();
    expect(await drainIterator(iter)).toEqual([
      { abc: { a: 'test', b: 1 } },
      { abc: { a: 'test', b: 3 } },
    ]);
  });
  it('should return order if specified', async () => {
    expect(iter.getOrder()).toEqual([['abc', 'b']]);
  });
});
