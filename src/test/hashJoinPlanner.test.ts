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
        leftDepends: true,
        rightDepends: false,
        compares: [],
        tables: [],
      });
  });
  it('should handle AND cases', () => {
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = b.b AND a.b = b.c;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'b' },
            { type: 'column', table: 'a', name: 'a' },
          ],
        }],
        tables: [[[
          { type: 'column', table: 'b', name: 'c' },
          { type: 'column', table: 'b', name: 'b' },
        ]]],
      });
  });
  it('should handle OR cases (n:1)', () => {
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = b.b OR a.a = b.c;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'a' },
          ],
        }],
        tables: [[
          [{ type: 'column', table: 'b', name: 'b' }],
          [{ type: 'column', table: 'b', name: 'c' }],
        ]],
      });
  });
  it('should handle OR cases (1:n)', () => {
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = b.b OR a.b = b.b;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'a' },
          ],
        }, {
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'b' },
          ],
        }],
        tables: [[[{ type: 'column', table: 'b', name: 'b' }]]],
      });
  });
  it('should handle OR cases (1:1)', () => {
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = b.b OR a.b = b.c;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'a' },
          ],
        }, {
          tableId: 1,
          value: [
            { type: 'column', table: 'a', name: 'b' },
          ],
        }],
        tables: [
          [[{ type: 'column', table: 'b', name: 'b' }]],
          [[{ type: 'column', table: 'b', name: 'c' }]],
        ],
      });
  });
});
