import parse, { Expression } from 'yasqlp';

import { rewriteNot } from '../../../expression/optimize/boolean';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select stement');
}

describe('rewriteNot', () => {
  it('should run simple cases', () => {
    expect(rewriteNot(getWhere('SELECT 1 WHERE a = 1;')))
      .toEqual(getWhere('SELECT 1 WHERE a = 1;'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT(a = 1);')))
      .toEqual(getWhere('SELECT 1 WHERE a != 1;'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT(TRUE);')))
      .toEqual(getWhere('SELECT 1 WHERE FALSE;'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT(NOT(a > 3));')))
      .toEqual(getWhere('SELECT 1 WHERE a > 3;'));
  });
  it('should inverse logical expressions', () => {
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT(a = 1 OR a > 2);')))
      .toEqual(getWhere('SELECT 1 WHERE a != 1 AND a <= 2;'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT(a = 1 AND a > 2);')))
      .toEqual(getWhere('SELECT 1 WHERE a != 1 OR a <= 2;'));
    expect(rewriteNot(getWhere(
      'SELECT 1 WHERE NOT(a = 1 AND a > 2 AND NOT(b = 1 OR b = 2));')))
    .toEqual(getWhere(
      'SELECT 1 WHERE a != 1 OR a <= 2 OR (b = 1 OR b = 2);'));
  });
  it('should apply NOT to terminal expressions', () => {
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT(a = 1 OR a IN (1, 2));')))
      .toEqual(getWhere('SELECT 1 WHERE a != 1 AND a NOT IN (1, 2);'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT(a = 1 OR MIN(a));')))
      .toEqual(getWhere('SELECT 1 WHERE a != 1 AND NOT MIN(a);'));
  });
});
