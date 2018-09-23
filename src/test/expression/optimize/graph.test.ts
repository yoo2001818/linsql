import parse, { Expression } from 'yasqlp';

import rewriteGraph from '../../../expression/optimize/graph';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select statement');
}

function getColumn(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.columns[0].value;
  throw new Error('Given statement is not select statement');
}

describe('rewriteNot', () => {
  it('should run simple cases', () => {
    expect(rewriteGraph(getWhere(
      'SELECT 1 WHERE a.a > 1 AND b.d = b.c AND a.a = b.c AND TRUE;')))
      .toEqual({
        type: 'custom',
        customType: 'andGraph',
        nodes: [
          {
            id: 0,
            names: [
              getColumn('SELECT a.a;'),
              getColumn('SELECT b.d;'),
              getColumn('SELECT b.c;'),
            ],
            constraints: [
              getWhere('SELECT 1 WHERE a.a > 1;'),
            ],
            connections: [],
          },
        ],
        leftovers: [
          getColumn('SELECT TRUE;'),
        ],
      });
  });
  it('should treat column-constant OR as constraint', () => {
    expect(rewriteGraph(getWhere(
      'SELECT 1 WHERE (a.a = 1 OR a.a = 2 OR a.a = 3) AND a.a = a.b;')))
      .toEqual({
        type: 'custom',
        customType: 'andGraph',
        nodes: [
          {
            id: 0,
            names: [
              getColumn('SELECT a.a;'),
              getColumn('SELECT a.b;'),
            ],
            constraints: [
              getWhere('SELECT 1 WHERE a.a = 1 OR a.a = 2 OR a.a = 3;'),
            ],
            connections: [],
          },
        ],
        leftovers: [],
      });
  });
  it('should treat connections', () => {
    expect(rewriteGraph(getWhere(
      'SELECT 1 WHERE a.a = 1 AND a.a > a.b;')))
      .toEqual({
        type: 'custom',
        customType: 'andGraph',
        nodes: [
          {
            id: 0,
            names: [
              getColumn('SELECT a.a;'),
            ],
            constraints: [
              getWhere('SELECT 1 WHERE a.a = 1;'),
            ],
            connections: [
              { id: 1, op: '>' },
            ],
          }, {
            id: 1,
            names: [
              getColumn('SELECT a.b;'),
            ],
            constraints: [],
            connections: [
              { id: 0, op: '<' },
            ],
          },
        ],
        leftovers: [],
      });
  });
});
