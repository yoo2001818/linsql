import evaluate from '../../expression/evaluate';
import { getColumn } from '../../util/select';

describe('evaluate', () => {
  it('should evaluate simple expressions', () => {
    const row: any = { a: { b: 3, c: null } };
    expect(evaluate(getColumn('SELECT 1 + 2;'))).toBe(3);
    expect(evaluate(getColumn('SELECT FLOOR(3.2) * 5 + 3;'))).toBe(18);
    expect(evaluate(getColumn('SELECT NOT TRUE;'))).toBe(false);
    expect(evaluate(getColumn('SELECT a.b + 3;'), row)).toBe(6);
    expect(evaluate(getColumn('SELECT a.b = 3;'), row)).toBe(true);
    expect(evaluate(getColumn('SELECT a.b IS NULL;'), row)).toBe(false);
    expect(evaluate(getColumn('SELECT a.c = 3;'), row)).toBe(null);
    expect(evaluate(getColumn('SELECT a.c IS NULL;'), row)).toBe(true);
  });
  it('should evaluate treat null well', () => {
    expect(evaluate(getColumn('SELECT TRUE AND NULL AND FALSE;'))).toBe(false);
    expect(evaluate(getColumn('SELECT NULL OR FALSE;'))).toBe(false);
    expect(evaluate(getColumn('SELECT NULL = 5;'))).toBe(null);
    expect(evaluate(getColumn('SELECT 5 IS NOT NULL;'))).toBe(true);
    expect(evaluate(getColumn('SELECT 1.5 + (NULL);'))).toBe(null);
    expect(evaluate(getColumn('SELECT NOT NULL;'))).toBe(null);
    expect(evaluate(getColumn('SELECT ~(NULL);'))).toBe(null);
  });
});
