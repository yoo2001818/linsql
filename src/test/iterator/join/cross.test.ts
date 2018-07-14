import parse, { Expression } from 'yasqlp';

import InputIterator from '../../../iterator/input';
import CrossJoinIterator from '../../../iterator/join/cross';
import RowIterator from '../../../iterator/type';

import drainIterator from '../../../util/drainIterator';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select stement');
}

describe('CrossJoiniterator', () => {
  let iter: RowIterator;
  beforeEach(() => {
    iter = new InputIterator('users', [
      { id: 1, name: 'John', age: 11 },
      { id: 2, name: 'Steve', age: 12 },
      { id: 3, name: 'David', age: 10 },
      { id: 4, name: 'Alex', age: 9 },
    ]);
    let iter2 = new InputIterator('accounts', [
      { id: 1, user_id: 1, name: '보통예금', amount: 12000 },
      { id: 2, user_id: 2, name: '보통예금', amount: 11000 },
      { id: 3, user_id: 3, name: '정기적금', amount: 1000 },
      { id: 4, user_id: 4, name: '현금', amount: 0 },
      { id: 5, user_id: 3, name: '잡손실', amount: 1000 },
    ]);
    iter = new CrossJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE users.id = accounts.user_id;'));
  });
  it('should return right result', async () => {
    expect(await drainIterator(iter)).toEqual([{
      users: { id: 1, name: 'John', age: 11 },
      accounts: { id: 1, user_id: 1, name: '보통예금', amount: 12000 },
    }, {
      users: { id: 2, name: 'Steve', age: 12 },
      accounts: { id: 2, user_id: 2, name: '보통예금', amount: 11000 },
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
});
