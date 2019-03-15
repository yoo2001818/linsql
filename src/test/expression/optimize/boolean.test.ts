import { rewriteNot, rewriteBetweenIn } from '../../../expression/optimize/boolean';
import { getWhere } from '../../../util/select';

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
  it('should treat nested expressions independently', () => {
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT((a = 1) = TRUE);')))
      .toEqual(getWhere('SELECT 1 WHERE (a = 1) != TRUE;'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE NOT((NOT(a != TRUE)) = TRUE);')))
      .toEqual(getWhere('SELECT 1 WHERE (a = TRUE) != TRUE;'));
  });
});

describe('rewriteBetweenIn', () => {
  it('should run correctly', () => {
    expect(rewriteBetweenIn(getWhere('SELECT 1 WHERE a BETWEEN 1 AND 3;')))
      .toEqual(getWhere('SELECT 1 WHERE 1 <= a AND a <= 3;'));
    expect(rewriteBetweenIn(getWhere('SELECT 1 WHERE a IN (1, 3);')))
      .toEqual(getWhere('SELECT 1 WHERE a = 1 OR a = 3;'));
    expect(rewriteBetweenIn(getWhere('SELECT 1 WHERE a IN (SELECT 3);')))
      .toEqual(getWhere('SELECT 1 WHERE a IN (SELECT 3);'));
  });
});

describe('rewriteRange', () => {
  it('should run simple cases', () => {
    expect(rewriteNot(getWhere('SELECT 1 WHERE a = 1 AND a = 2;')))
      .toEqual(getWhere('SELECT 1 WHERE FALSE;'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE a > 1 AND a > 5;')))
      .toEqual(getWhere('SELECT 1 WHERE a > 5;'));
    expect(rewriteNot(getWhere('SELECT 1 WHERE a > 1 AND a >= 1;')))
      .toEqual(getWhere('SELECT 1 WHERE a > 1;'));
  });
});
