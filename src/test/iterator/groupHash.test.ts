import parse, { Expression, OrderByRef } from 'yasqlp';

import InputIterator from '../../iterator/input';
import GroupHashIterator from '../../iterator/groupHash';
import RowIterator from '../../iterator/type';

import drainIterator from '../../util/drainIterator';

function getColumns(code: string): Expression[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.columns.map(v => v.value);
  throw new Error('Given statement is not select stement');
}

function getOrderBy(code: string): OrderByRef[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.order;
  throw new Error('Given statement is not select stement');
}

describe('GroupHashIterator', () => {
  let iterInput: RowIterator;
  let iter: RowIterator;
  beforeEach(() => {
    iterInput = new InputIterator('table', [
      { userId: 1, amount: 1000 },
      { userId: 1, amount: 2000 },
      { userId: 1, amount: 3000 },
      { userId: 1, amount: 4000 },
      { userId: 1, amount: 5000 },
      { userId: 2, amount: -10 },
      { userId: 2, amount: 500 },
      { userId: 3, amount: null },
      { userId: 3, amount: 25 },
      { userId: 3, amount: -11 },
      { userId: 4, amount: 'bow' },
      { userId: 4, amount: 'wow' },
    ], ['userId']);
  });
  it('should run group by correctly', async () => {
    const aggrName = 'sum-row[\'table\'][\'amount\']';
    iter = new GroupHashIterator(iterInput,
      getColumns('SELECT table.userId;'),
      getColumns('SELECT SUM(table.amount);'),
    );
    expect(await drainIterator(iter)).toEqual([
      { table: { userId: 1, amount: 1000 }, _aggr: { [aggrName]: 15000 } },
      { table: { userId: 2, amount: -10 }, _aggr: { [aggrName]: 490 } },
      { table: { userId: 3, amount: null }, _aggr: { [aggrName]: 14 } },
      { table: { userId: 4, amount: 'bow' }, _aggr: { [aggrName]: null } },
    ]);
  });
  it('should run group by correctly (count)', async () => {
    const aggrName = 'count-row[\'table\'][\'amount\']';
    iter = new GroupHashIterator(iterInput,
      getColumns('SELECT table.userId;'),
      getColumns('SELECT COUNT(table.amount);'),
    );
    expect(await drainIterator(iter)).toEqual([
      { table: { userId: 1, amount: 1000 }, _aggr: { [aggrName]: 5 } },
      { table: { userId: 2, amount: -10 }, _aggr: { [aggrName]: 2 } },
      { table: { userId: 3, amount: null }, _aggr: { [aggrName]: 2 } },
      { table: { userId: 4, amount: 'bow' }, _aggr: { [aggrName]: 2 } },
    ]);
  });
  it('should run group by correctly (min)', async () => {
    const aggrName = 'min-row[\'table\'][\'amount\']';
    iter = new GroupHashIterator(iterInput,
      getColumns('SELECT table.userId;'),
      getColumns('SELECT MIN(table.amount);'),
    );
    expect(await drainIterator(iter)).toEqual([
      { table: { userId: 1, amount: 1000 }, _aggr: { [aggrName]: 1000 } },
      { table: { userId: 2, amount: -10 }, _aggr: { [aggrName]: -10 } },
      { table: { userId: 3, amount: null }, _aggr: { [aggrName]: -11 } },
      { table: { userId: 4, amount: 'bow' }, _aggr: { [aggrName]: 'bow' } },
    ]);
  });
  it('should run group by correctly (max)', async () => {
    const aggrName = 'max-row[\'table\'][\'amount\']';
    iter = new GroupHashIterator(iterInput,
      getColumns('SELECT table.userId;'),
      getColumns('SELECT MAX(table.amount);'),
    );
    expect(await drainIterator(iter)).toEqual([
      { table: { userId: 1, amount: 1000 }, _aggr: { [aggrName]: 5000 } },
      { table: { userId: 2, amount: -10 }, _aggr: { [aggrName]: 500 } },
      { table: { userId: 3, amount: null }, _aggr: { [aggrName]: 25 } },
      { table: { userId: 4, amount: 'bow' }, _aggr: { [aggrName]: 'wow' } },
    ]);
  });
  it('should be rewindable', async () => {
    const aggrName = 'sum-row[\'table\'][\'amount\']';
    iter = new GroupHashIterator(iterInput,
      getColumns('SELECT table.userId;'),
      getColumns('SELECT SUM(table.amount);'),
    );
    await drainIterator(iter);
    iter.rewind();
    expect(await drainIterator(iter)).toEqual([
      { table: { userId: 1, amount: 1000 }, _aggr: { [aggrName]: 15000 } },
      { table: { userId: 2, amount: -10 }, _aggr: { [aggrName]: 490 } },
      { table: { userId: 3, amount: null }, _aggr: { [aggrName]: 14 } },
      { table: { userId: 4, amount: 'bow' }, _aggr: { [aggrName]: null } },
    ]);
  });
  it('should be rewindable with parent row', async () => {
    const aggrName = 'sum-(row[\'table\'][\'amount\']+' +
      'parent[\'parent\'][\'x\'])';
    iter = new GroupHashIterator(iterInput,
      getColumns('SELECT table.userId;'),
      getColumns('SELECT SUM(table.amount + parent.x);'),
    );
    iter.rewind({ parent: { x: 0 } });
    expect(await drainIterator(iter)).toEqual([
      { table: { userId: 1, amount: 1000 }, _aggr: { [aggrName]: 15000 } },
      { table: { userId: 2, amount: -10 }, _aggr: { [aggrName]: 490 } },
      { table: { userId: 3, amount: null }, _aggr: { [aggrName]: 14 } },
      { table: { userId: 4, amount: 'bow' }, _aggr: { [aggrName]: null } },
    ]);
    iter.rewind({ parent: { x: 30 } });
    expect(await drainIterator(iter)).toEqual([
      { table: { userId: 1, amount: 1000 }, _aggr: { [aggrName]: 15150 } },
      { table: { userId: 2, amount: -10 }, _aggr: { [aggrName]: 550 } },
      { table: { userId: 3, amount: null }, _aggr: { [aggrName]: 104 } },
      { table: { userId: 4, amount: 'bow' }, _aggr: { [aggrName]: null } },
    ]);
  });
  it('should return order if specified', async () => {
    iter = new GroupHashIterator(iterInput,
      getColumns('SELECT table.userId;'),
      getColumns('SELECT SUM(table.amount);'),
    );
    expect(iter.getOrder()).toEqual(
      getOrderBy('SELECT 1 ORDER BY table.userId;'));
  });
});
