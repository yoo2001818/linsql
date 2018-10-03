import InputIterator from '../../iterator/input';
import GroupIterator from '../../iterator/group';
import RowIterator from '../../iterator/type';

import drainIterator from '../../util/drainIterator';
import { getColumns, getOrderBy } from '../../util/select';

describe('GroupIterator', () => {
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
    iter = new GroupIterator(iterInput,
      getColumns('SELECT table.userId;').map(v => v.value),
      getColumns('SELECT SUM(table.amount);').map(v => v.value),
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
    iter = new GroupIterator(iterInput,
      getColumns('SELECT table.userId;').map(v => v.value),
      getColumns('SELECT COUNT(table.amount);').map(v => v.value),
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
    iter = new GroupIterator(iterInput,
      getColumns('SELECT table.userId;').map(v => v.value),
      getColumns('SELECT MIN(table.amount);').map(v => v.value),
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
    iter = new GroupIterator(iterInput,
      getColumns('SELECT table.userId;').map(v => v.value),
      getColumns('SELECT MAX(table.amount);').map(v => v.value),
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
    iter = new GroupIterator(iterInput,
      getColumns('SELECT table.userId;').map(v => v.value),
      getColumns('SELECT SUM(table.amount);').map(v => v.value),
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
    iter = new GroupIterator(iterInput,
      getColumns('SELECT table.userId;').map(v => v.value),
      getColumns('SELECT SUM(table.amount + parent.x);').map(v => v.value),
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
    iter = new GroupIterator(iterInput,
      getColumns('SELECT table.userId;').map(v => v.value),
      getColumns('SELECT SUM(table.amount);').map(v => v.value),
    );
    expect(iter.getOrder()).toEqual(
      getOrderBy('SELECT 1 ORDER BY table.userId;'));
  });
});
