import InputIterator from '../../../iterator/input';
import CrossJoinIterator from '../../../iterator/join/cross';
import RowIterator from '../../../iterator/type';

import drainIterator from '../../../util/drainIterator';
import { getWhere, getOrderBy } from '../../../util/select';

describe('CrossJoinIterator', () => {
  let iter: RowIterator;
  let iter2: RowIterator;
  beforeEach(() => {
    iter = new InputIterator('users', [
      { id: 1, name: 'John', age: 11 },
      { id: 2, name: 'Steve', age: 12 },
      { id: 3, name: 'David', age: 10 },
      { id: 4, name: 'Alex', age: 9 },
    ]);
    iter2 = new InputIterator('accounts', [
      { id: 1, user_id: 1, name: '보통예금', amount: 12000 },
      { id: 3, user_id: 3, name: '정기적금', amount: 1000 },
      { id: 4, user_id: 4, name: '현금', amount: 0 },
      { id: 5, user_id: 3, name: '잡손실', amount: 1000 },
    ]);
  });
  it('should return correct result', async () => {
    iter = new CrossJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE users.id = accounts.user_id;'));
    expect(await drainIterator(iter)).toEqual([{
      users: { id: 1, name: 'John', age: 11 },
      accounts: { id: 1, user_id: 1, name: '보통예금', amount: 12000 },
    }, {
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 3, user_id: 3, name: '정기적금', amount: 1000 },
    }, {
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 5, user_id: 3, name: '잡손실', amount: 1000 },
    }, {
      users: { id: 4, name: 'Alex', age: 9 },
      accounts: { id: 4, user_id: 4, name: '현금', amount: 0 },
    }]);
  });
  it('should handle left join', async () => {
    iter = new CrossJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE users.id = accounts.user_id;'), true);
    expect(await drainIterator(iter)).toEqual([{
      users: { id: 1, name: 'John', age: 11 },
      accounts: { id: 1, user_id: 1, name: '보통예금', amount: 12000 },
    }, {
      users: { id: 2, name: 'Steve', age: 12 },
      accounts: {},
    }, {
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 3, user_id: 3, name: '정기적금', amount: 1000 },
    }, {
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 5, user_id: 3, name: '잡손실', amount: 1000 },
    }, {
      users: { id: 4, name: 'Alex', age: 9 },
      accounts: { id: 4, user_id: 4, name: '현금', amount: 0 },
    }]);
  });
  it('should be rewindable', async () => {
    iter = new CrossJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE users.id = accounts.user_id;'));
    await drainIterator(iter);
    iter.rewind();
    expect(await drainIterator(iter)).toEqual([{
      users: { id: 1, name: 'John', age: 11 },
      accounts: { id: 1, user_id: 1, name: '보통예금', amount: 12000 },
    }, {
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 3, user_id: 3, name: '정기적금', amount: 1000 },
    }, {
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 5, user_id: 3, name: '잡손실', amount: 1000 },
    }, {
      users: { id: 4, name: 'Alex', age: 9 },
      accounts: { id: 4, user_id: 4, name: '현금', amount: 0 },
    }]);
  });
  it('should be rewindable with parent row', async () => {
    iter = new CrossJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE users.id = accounts.user_id AND users.id = test.a;'));
    iter.rewind({ test: { a: 3 } });
    expect(await drainIterator(iter)).toEqual([{
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 3, user_id: 3, name: '정기적금', amount: 1000 },
    }, {
      users: { id: 3, name: 'David', age: 10 },
      accounts: { id: 5, user_id: 3, name: '잡손실', amount: 1000 },
    }]);
  });
  it('should return correct order', async () => {
    let dummyWhere = getWhere('SELECT 1 WHERE 1;');
    expect(new CrossJoinIterator(
      new InputIterator('a', [], ['name']),
      new InputIterator('b', [], ['name']),
      dummyWhere).getOrder()).toEqual(
        getOrderBy('SELECT 1 ORDER BY a.name, b.name;'));
    expect(new CrossJoinIterator(
      new InputIterator('a', []),
      new InputIterator('b', [], ['name']),
      dummyWhere).getOrder()).toEqual(null);
    expect(new CrossJoinIterator(
      new InputIterator('a', [], ['name']),
      new InputIterator('b', []),
      dummyWhere).getOrder()).toEqual(getOrderBy('SELECT 1 ORDER BY a.name;'));
  });
});
