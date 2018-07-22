import parse, { Statement, Expression } from 'yasqlp';
import planHashJoin from '../hashJoinPlanner';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select stement');
}

describe('hashJoinPlanner', () => {
  it('should handle simple cases', () => {
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = b.b;'), ['a'], ['b']))
      .toEqual({
        left: ['a'],
        right: ['b'],
        leftDepends: true,
        rightDepends: true,
        compares: [{
          tableId: 0,
          value: [{ type: 'column', table: 'a', name: 'a' }],
        }],
        tables: [[[{
          type: 'column', table: 'b', name: 'b',
        }]]],
      });
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = 1;'), ['a'], ['b']))
      .toEqual({
        left: ['a'],
        right: ['b'],
        leftDepends: true,
        rightDepends: false,
        compares: [],
        tables: [],
      });
  });
});
