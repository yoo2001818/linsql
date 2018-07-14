import parse, { SelectColumn } from 'yasqlp';

import InputIterator from '../../iterator/input';
import MapIterator from '../../iterator/map';
import OutputIterator from '../../iterator/output';
import RowIterator from '../../iterator/type';

import drainIterator from '../../util/drainIterator';

function getColumns(code: string): SelectColumn[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.columns;
  throw new Error('Given statement is not select stement');
}

describe('MapIterator', () => {
  let iter: RowIterator;
  beforeEach(() => {
    iter = new InputIterator('abc', [
      { a: 'test', b: 1 }, { a: 'abc', b: 3 }, { a: 'test', b: 3 },
    ]);
    iter = new MapIterator(iter, getColumns(
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
});