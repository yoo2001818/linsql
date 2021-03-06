import InputIterator from '../../iterator/input';
import MapIterator from '../../iterator/map';
import OutputIterator from '../../iterator/output';
import RowIterator from '../../iterator/type';

import drainIterator from '../../util/drainIterator';
import { getColumns, getOrderBy } from '../../util/select';

describe('MapIterator', () => {
  let iterInput: RowIterator;
  let iter: RowIterator;
  beforeEach(() => {
    iterInput = new InputIterator('abc', [
      { a: 'test', b: 1 }, { a: 'abc', b: 3 }, { a: 'test', b: 3 },
    ], ['b']);
    iter = new MapIterator(iterInput, getColumns(
      'SELECT abc.a + abc.b AS added, FLOOR((abc.b + 20) / 2);'));
    iter = new OutputIterator(iter);
  });
  it('should return right result', async () => {
    expect(await drainIterator(iter)).toEqual([
      { added: 'test1', '1': 10 },
      { added: 'abc3', '1': 11 },
      { added: 'test3', '1': 11 },
    ]);
  });
  it('should be rewindable', async () => {
    await drainIterator(iter);
    iter.rewind();
    expect(await drainIterator(iter)).toEqual([
      { added: 'test1', '1': 10 },
      { added: 'abc3', '1': 11 },
      { added: 'test3', '1': 11 },
    ]);
  });
  it('should be rewindable with parent row', async () => {
    iter = new MapIterator(iterInput, getColumns(
      'SELECT abc.a + test.b AS added, test.a / abc.b;'));
    iter = new OutputIterator(iter);
    iter.rewind({ test: { b: ' world', a: 30 } });
    expect(await drainIterator(iter)).toEqual([
      { added: 'test world', '1': 30 },
      { added: 'abc world', '1': 10 },
      { added: 'test world', '1': 10 },
    ]);
  });
  it('should return order if specified', async () => {
    expect(iter.getOrder()).toEqual(getOrderBy('SELECT 1 ORDER BY abc.b;'));
  });
});
