import InputIterator from '../../../iterator/input';
import MergeJoinIterator from '../../../iterator/join/merge';
import RowIterator from '../../../iterator/type';

import drainIterator from '../../../util/drainIterator';
import { getWhere, getOrderBy } from '../../../util/select';

describe('MergeJoinIterator', () => {
  let iter: RowIterator;
  let iter2: RowIterator;
  beforeEach(() => {
    iter = new InputIterator('users', [
      { id: 1, name: 'John', age: 11 },
      { id: 2, name: 'Steve', age: 12 },
      { id: 3, name: 'David', age: 10 },
      { id: 4, name: 'Alex', age: 9 },
      { id: 4, name: 'Alex 2', age: 9 },
      { id: 5, name: 'Tom', age: 14 },
      { id: 5, name: 'Tom 2', age: 14 },
    ], ['id']);
    iter2 = new InputIterator('accounts', [
      { id: 1, user_id: 1, name: '보통예금', amount: 12000 },
      { id: 3, user_id: 3, name: '정기적금', amount: 1000 },
      { id: 5, user_id: 3, name: '잡손실', amount: 1000 },
      { id: 4, user_id: 4, name: '현금', amount: 0 },
      { id: 6, user_id: 5, name: '현금과부족', amount: 0 },
      { id: 7, user_id: 5, name: '전기이월', amount: 0 },
    ], ['user_id']);
  });
  it('should return correct result', async () => {
    iter = new MergeJoinIterator(iter, iter2, getWhere(
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
    }, {
      users: { id: 4, name: 'Alex 2', age: 9 },
      accounts: { id: 4, user_id: 4, name: '현금', amount: 0 },
    }, {
      users: { id: 5, name: 'Tom', age: 14 },
      accounts: { id: 6, user_id: 5, name: '현금과부족', amount: 0 },
    }, {
      users: { id: 5, name: 'Tom', age: 14 },
      accounts: { id: 7, user_id: 5, name: '전기이월', amount: 0 },
    }, {
      users: { id: 5, name: 'Tom 2', age: 14 },
      accounts: { id: 6, user_id: 5, name: '현금과부족', amount: 0 },
    }, {
      users: { id: 5, name: 'Tom 2', age: 14 },
      accounts: { id: 7, user_id: 5, name: '전기이월', amount: 0 },
    }]);
  });
  it('should handle left join', async () => {
    iter = new InputIterator('a',
      [1, 2, 3, 4, 5, 6, 7].map(i => ({ id: i })), ['id']);
    iter2 = new InputIterator('b',
      [1, 4, 5].map(i => ({ id: i })), ['id']);
    iter = new MergeJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE a.id = b.id;'), true);
    expect(await drainIterator(iter)).toEqual([
      { a: { id: 1 }, b: { id: 1 } },
      { a: { id: 2 }, b: {} },
      { a: { id: 3 }, b: {} },
      { a: { id: 4 }, b: { id: 4 } },
      { a: { id: 5 }, b: { id: 5 } },
      { a: { id: 6 }, b: {} },
      { a: { id: 7 }, b: {} },
    ]);
  });
  it('should handle right join', async () => {
    iter = new InputIterator('a',
      [1, 2, 3, 4, 5, 6, 7].map(i => ({ id: i })), ['id']);
    iter2 = new InputIterator('b',
      [1, 4, 5].map(i => ({ id: i })), ['id']);
    iter = new MergeJoinIterator(iter2, iter, getWhere(
      'SELECT 1 WHERE a.id = b.id;'), false, true);
    expect(await drainIterator(iter)).toEqual([
      { a: { id: 1 }, b: { id: 1 } },
      { a: { id: 2 }, b: {} },
      { a: { id: 3 }, b: {} },
      { a: { id: 4 }, b: { id: 4 } },
      { a: { id: 5 }, b: { id: 5 } },
      { a: { id: 6 }, b: {} },
      { a: { id: 7 }, b: {} },
    ]);
  });
  it('should be rewindable', async () => {
    iter = new MergeJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE users.id = accounts.user_id;'));
    await drainIterator(iter);
    iter.rewind();
    expect((await drainIterator(iter)).length).toBe(9);
  });
  it('should be rewindable with parent row', async () => {
    iter = new MergeJoinIterator(iter, iter2, getWhere(
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
    let dummyWhere = getWhere('SELECT 1 WHERE a.name = b.name;');
    expect(new MergeJoinIterator(
      new InputIterator('a', [], ['name']),
      new InputIterator('b', [], ['name']),
      dummyWhere).getOrder()).toEqual(
        getOrderBy('SELECT 1 ORDER BY a.name, b.name;'));
  });
});
