import { rewriteConstant } from '../../../expression/optimize/algebra';
import { getColumn } from '../../../util/select';

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
  it('should handle logical operators', () => {
    expect(rewriteConstant(getColumn('SELECT 5 IS NULL AND a.a = 2;')))
      .toEqual(getColumn('SELECT FALSE AND a.a = 2;'));
    expect(rewriteConstant(getColumn('SELECT (2 + 4 = 6 AND TRUE) OR a.c;')))
      .toEqual(getColumn('SELECT TRUE OR a.c;'));
  });
});
