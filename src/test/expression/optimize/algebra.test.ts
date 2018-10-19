import { rewriteIdentity, rewriteConstant, rewriteSargable }
  from '../../../expression/optimize/algebra';
import { getColumn } from '../../../util/select';

describe('rewriteIdentity', () => {
  it('should trim binary operators', () => {
    expect(rewriteIdentity(getColumn('SELECT a + 0;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT 0 + a;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT a - 0;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT 0 - a;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT a ^ 0;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT 0 ^ a;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT a * 0;')))
      .toEqual(getColumn('SELECT 0;'));
    expect(rewriteIdentity(getColumn('SELECT 0 * a;')))
      .toEqual(getColumn('SELECT 0;'));
    expect(rewriteIdentity(getColumn('SELECT a * 1;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT 1 * a;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT a * -1;')))
      .toEqual(getColumn('SELECT -a;'));
    expect(rewriteIdentity(getColumn('SELECT -1 * a;')))
      .toEqual(getColumn('SELECT -a;'));
    expect(rewriteIdentity(getColumn('SELECT 0 / a;')))
      .toEqual(getColumn('SELECT 0;'));
    expect(rewriteIdentity(getColumn('SELECT a / 1;')))
      .toEqual(getColumn('SELECT a;'));
    expect(rewriteIdentity(getColumn('SELECT a / -1;')))
      .toEqual(getColumn('SELECT -a;'));
    expect(rewriteIdentity(getColumn('SELECT a / 2;')))
      .toEqual(getColumn('SELECT a / 2;'));
  });
  it('should trim logical operators operators', () => {
    expect(rewriteIdentity(getColumn('SELECT FALSE OR FALSE;')))
      .toEqual(getColumn('SELECT FALSE;'));
    expect(rewriteIdentity(getColumn('SELECT FALSE AND FALSE;')))
      .toEqual(getColumn('SELECT FALSE;'));
    expect(rewriteIdentity(getColumn('SELECT TRUE OR TRUE;')))
      .toEqual(getColumn('SELECT TRUE;'));
    expect(rewriteIdentity(getColumn('SELECT TRUE AND TRUE;')))
      .toEqual(getColumn('SELECT TRUE;'));
  });
});

describe('rewriteConstant', () => {
  it('should run simple cases', () => {
    expect(rewriteConstant(getColumn('SELECT 5 + 3;')))
      .toEqual(getColumn('SELECT 8;'));
    expect(rewriteConstant(getColumn('SELECT a.b + 3 * 9;')))
      .toEqual(getColumn('SELECT a.b + 27;'));
    expect(rewriteConstant(getColumn('SELECT FLOOR(7.2) = a.c;')))
      .toEqual(getColumn('SELECT 7 = a.c;'));
    expect(rewriteConstant(getColumn('SELECT 6 = 3;')))
      .toEqual(getColumn('SELECT FALSE;'));
  });
  it('should handle short-circuit logical operators', () => {
    expect(rewriteConstant(getColumn('SELECT 5 IS NULL AND a.a = 2;')))
      .toEqual(getColumn('SELECT FALSE;'));
    expect(rewriteConstant(getColumn('SELECT (2 + 4 = 6 AND TRUE) OR a.c;')))
      .toEqual(getColumn('SELECT TRUE;'));
  });
  it('should trim logical operators trivial expressions', () => {
    expect(rewriteConstant(getColumn('SELECT b = 3 AND 3 = 3;')))
      .toEqual(getColumn('SELECT b = 3;'));
    expect(rewriteConstant(getColumn('SELECT TRUE AND a.c = 3 AND a.b = 4;')))
      .toEqual(getColumn('SELECT a.c = 3 AND a.b = 4;'));
    expect(rewriteConstant(getColumn('SELECT FALSE OR NULL OR a.c = 3;')))
      .toEqual(getColumn('SELECT a.c = 3;'));
    expect(rewriteConstant(getColumn(
      'SELECT FALSE OR NULL OR a.c = 3 OR a.d = 2;')))
      .toEqual(getColumn('SELECT a.c = 3 OR a.d = 2;'));
    expect(rewriteConstant(getColumn('SELECT NULL AND a.b = 3;')))
      .toEqual(getColumn('SELECT NULL;'));
  });
  it('should expand expandable expressions', () => {
    expect(rewriteConstant(getColumn('SELECT (a + 5) * 2;')))
      .toEqual(getColumn('SELECT a * 2 + 10;'));
    expect(rewriteConstant(getColumn('SELECT 3 * (a - 2);')))
      .toEqual(getColumn('SELECT a * 3 - 6;'));
    expect(rewriteConstant(getColumn('SELECT (a + 5) * 2 * 3;')))
      .toEqual(getColumn('SELECT a * 6 + 30;'));
    expect(rewriteConstant(getColumn('SELECT (a - b) / 3;')))
      .toEqual(getColumn('SELECT a / 3 - b / 3;'));
    expect(rewriteConstant(getColumn('SELECT 3 / (a - b);')))
      .toEqual(getColumn('SELECT 3 / (a - b);'));
    expect(rewriteConstant(getColumn('SELECT 2 * (a + 5) * 3;')))
      .toEqual(getColumn('SELECT a * 6 + 30;'));
    expect(rewriteConstant(getColumn('SELECT ((a + 5) * 2 + b * 5) * 10;')))
      .toEqual(getColumn('SELECT a * 20 + b * 50 + 100;'));
  });
  it('should collapse expressions', () => {
    expect(rewriteConstant(getColumn('SELECT a + a + a + a;')))
      .toEqual(getColumn('SELECT a * 4;'));
    expect(rewriteConstant(getColumn('SELECT a * 3 - a;')))
      .toEqual(getColumn('SELECT a * 2;'));
    expect(rewriteConstant(getColumn('SELECT a / 2 - a / 2;')))
      .toEqual(getColumn('SELECT 0;'));
    expect(rewriteConstant(getColumn('SELECT (a + b) * 3 + 5 * a;')))
      .toEqual(getColumn('SELECT a * 8 + b * 3;'));
    expect(rewriteConstant(getColumn('SELECT a / 2 / 2 / 2 / 2 / 2 / 2;')))
      .toEqual(getColumn('SELECT a / 64;'));
    expect(rewriteConstant(getColumn('SELECT a - 3 - 3 - 3 - 3 - 3 - 3;')))
      .toEqual(getColumn('SELECT a - 18;'));
  });
});

describe('rewriteSargable', () => {
  it('should move columns to left', () => {
    expect(rewriteSargable(getColumn('SELECT 3 = a;')))
      .toEqual(getColumn('SELECT a = 3;'));
    expect(rewriteSargable(getColumn('SELECT -3 = -a;')))
      .toEqual(getColumn('SELECT a = 3;'));
    expect(rewriteSargable(getColumn('SELECT a - b = 0;')))
      .toEqual(getColumn('SELECT a = b;'));
  });
  it('should divide by factor', () => {
    expect(rewriteSargable(getColumn('SELECT a * 5 = 25;')))
      .toEqual(getColumn('SELECT a = 5;'));
    expect(rewriteSargable(getColumn('SELECT a / 5 = 5 / 5;')))
      .toEqual(getColumn('SELECT a = 5;'));
    expect(rewriteSargable(getColumn('SELECT a / b = 2;')))
      .toEqual(getColumn('SELECT a = 2 * b;'));
    expect(rewriteSargable(getColumn('SELECT a / 2 + b * 3 = 4;')))
      .toEqual(getColumn('SELECT a = b * -6 + 8;'));
  });
  it('should prefer columns', () => {
    expect(rewriteSargable(getColumn('SELECT (SELECT 1) + a.a + 3 = 0;')))
      .toEqual(getColumn('SELECT a.a = -(SELECT 1) - 3;'));
    expect(rewriteSargable(getColumn('SELECT a * b + a = 0;')))
      .toEqual(getColumn('SELECT a = -(a * b);'));
    expect(rewriteSargable(getColumn('SELECT a - b - c > 3;')))
      .toEqual(getColumn('SELECT a > b + c + 3;'));
  });
});
