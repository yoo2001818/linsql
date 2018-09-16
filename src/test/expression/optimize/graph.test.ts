import parse, { Expression } from 'yasqlp';

import rewriteGraph from '../../../expression/optimize/graph';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select stement');
}

function getColumn(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.columns[0].value;
  throw new Error('Given statement is not select stement');
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
            constants: [
              { op: '>', value: getColumn('SELECT 1;') },
            ],
            connections: [],
          },
          null,
          null,
        ],
        leftovers: [
          getColumn('SELECT TRUE;'),
        ],
      });
  });
});
