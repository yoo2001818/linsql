import parse, { Statement, Expression } from 'yasqlp';
import { getCode } from '../../util/compileExpression';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select stement');
}

function unindent(input: TemplateStringsArray) {
  return input.join('\n').split('\n').map(v => v.trim()).join('\n');
}

describe('compileExpression', () => {
  it('should compile simple expressions', () => {
    expect(getCode(getWhere('SELECT 1 WHERE a = TRUE AND b <> \'aa\';')))
      .toBe('return ((row._output[\'a\'] == true)&&' + 
        '(row._output[\'b\']!=\'aa\'));');
    expect(getCode(getWhere('SELECT 1 WHERE a IS NULL;')))
      .toBe('return (row._output[\'a\'] == null);');
    expect(getCode(getWhere('SELECT 1 WHERE a BETWEEN 1 AND 3;')))
      .toBe('return (1 <= row._output[\'a\'] && row._output[\'a\'] <= 3);');
  });
  it('should compile in', () => {
    expect(getCode(getWhere('SELECT 1 WHERE a.b IN (1, 2, 3);')))
      .toBe('return [1, 2, 3].includes(row[\'a\'][\'b\']);');
  });
  it('should compile case', () => {
    expect(getCode(getWhere('SELECT 1 WHERE CASE a WHEN 1 THEN 0 ELSE 1 END;')))
      .toBe(unindent`return (function () {
        var expr = row._output['a'];
        if (expr == 1) return 0;
        else return 1;
        })();`);
    expect(getCode(getWhere('SELECT 1 WHERE CASE WHEN 1 THEN 0 ELSE 1 END;')))
      .toBe(unindent`return (function () {
        if (1) return 0;
        else return 1;
        })();`);
  });
  it('should correctly escape strings', () => {
    expect(getCode(getWhere(`SELECT 1 WHERE 'Hello, ''this''';`)))
      .toBe('return \'Hello, \\\'this\\\'\';');
  });
  it('should compile aggregations', () => {
    expect(getCode(getWhere(`SELECT 1 WHERE COUNT(*);`)))
      .toBe('return row._aggr[\'count-*\'];');
    expect(getCode(getWhere(`SELECT 1 WHERE COUNT(abc);`)))
      .toBe('return row._aggr[\'count-row._output[\\\'abc\\\']\'];');
  });
  it('should compile functions', () => {
    expect(getCode(getWhere(`SELECT 1 WHERE ATAN2(-15, -5);`)))
      .toBe('return methods[\'atan2\'](-15, -5);');
  });
});