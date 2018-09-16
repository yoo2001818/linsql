import parse, { Statement, Expression } from 'yasqlp';
import planHashJoin from '../../planner/hashJoin';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select statement');
}

describe('hashJoinPlanner', () => {
  it('should handle simple cases', () => {
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = b.b;'), ['a'], ['b']))
      .toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
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
        complete: false,
        compares: [],
        tables: [],
      });
  });
  it('should handle AND cases', () => {
    expect(planHashJoin(getWhere('SELECT 1 WHERE a.a = b.b AND a.b = b.c;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
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
  it('should handle multiple AND cases', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE a.a = b.b AND a.b = b.c AND a.c = b.d;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'c' },
            { type: 'column', table: 'a', name: 'b' },
            { type: 'column', table: 'a', name: 'a' },
          ],
        }],
        tables: [[[
          { type: 'column', table: 'b', name: 'd' },
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
        complete: true,
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
        complete: true,
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
        complete: true,
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
  it('should handle multiple OR cases', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE a.a = b.b OR a.a = b.c OR a.b = b.d;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
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
        tables: [[
          [{ type: 'column', table: 'b', name: 'b' }],
          [{ type: 'column', table: 'b', name: 'c' }],
        ], [
          [{ type: 'column', table: 'b', name: 'd' }],
        ]],
      });
  });
  it('should handle OR in AND cases (unmergeable)', () => {
    // This is not really deterministic since one of them has to be selected.
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE (a.a = b.a OR a.b = b.b) AND (a.a = b.c OR a.b = b.d);'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
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
        tables: [[
          [{ type: 'column', table: 'b', name: 'a' }],
        ], [
          [{ type: 'column', table: 'b', name: 'b' }],
        ]],
      });
  });
  it('should handle OR in AND cases (unmergeable 2)', () => {
    // This is not really deterministic since one of them has to be selected.
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE (a.a = b.a OR a.a = b.b) AND (a.a = b.c OR a.a = b.d);'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'a' },
          ],
        }],
        tables: [[
          [{ type: 'column', table: 'b', name: 'a' }],
          [{ type: 'column', table: 'b', name: 'b' }],
        ]],
      });
  });
  it('should handle OR in AND cases (mergeable)', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE (a.a = b.a OR a.a = b.b) AND a.a = b.d;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'a' },
            { type: 'column', table: 'a', name: 'a' },
          ],
        }],
        tables: [[[
          { type: 'column', table: 'b', name: 'a' },
          { type: 'column', table: 'b', name: 'd' },
        ], [
          { type: 'column', table: 'b', name: 'b' },
          { type: 'column', table: 'b', name: 'd' },
        ]]],
      });
  });
  it('should handle OR in AND cases (noop)', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE (a.a = b.b OR a.b = b.c) AND TRUE;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: false,
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
  it('should handle AND in OR cases (mergeable)', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE (a.a = b.b AND a.b = b.c) OR (a.a = b.d AND a.b = b.e);'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
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
        ], [
          { type: 'column', table: 'b', name: 'e' },
          { type: 'column', table: 'b', name: 'd' },
        ]]],
      });
  });
  it('should handle AND in OR cases (separate)', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE (a.a = b.b AND a.b = b.c) OR (a.c = b.d AND a.d = b.e);'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
        compares: [{
          tableId: 0,
          value: [
            { type: 'column', table: 'a', name: 'b' },
            { type: 'column', table: 'a', name: 'a' },
          ],
        }, {
          tableId: 1,
          value: [
            { type: 'column', table: 'a', name: 'd' },
            { type: 'column', table: 'a', name: 'c' },
          ],
        }],
        tables: [[[
          { type: 'column', table: 'b', name: 'c' },
          { type: 'column', table: 'b', name: 'b' },
        ]], [[
          { type: 'column', table: 'b', name: 'e' },
          { type: 'column', table: 'b', name: 'd' },
        ]]],
      });
  });
  it('should handle functions and expressions', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE CEIL(a.a / 10 + 5) = FLOOR(b.a * 10 - 3);'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
        compares: [{
          tableId: 0,
          value: [
            getWhere('SELECT 1 WHERE CEIL(a.a / 10 + 5);'),
          ],
        }],
        tables: [[[
          getWhere('SELECT 1 WHERE FLOOR(b.a * 10 - 3);'),
        ]]],
      });
  });
  it('should treat irregular expressions as nothing', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE (a.a = b.b) > FALSE;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: false,
        compares: [],
        tables: [],
      });
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE NOT (a.a = b.b);'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: true,
        compares: [],
        tables: [],
      });
  });
  it('should treat OR with unknown as nothing (2)', () => {
    expect(planHashJoin(getWhere(
      'SELECT 1 WHERE a.a > b.b OR a.a = b.b;'),
      ['a'], ['b'])).toEqual({
        leftDepends: true,
        rightDepends: true,
        complete: false,
        compares: [],
        tables: [],
      });
  });
});
