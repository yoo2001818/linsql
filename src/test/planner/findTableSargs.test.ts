import findTableSargs from '../../planner/findTableSargs';
import optimize from '../../expression/optimize';

import { getWhere } from '../../util/select';

describe('findTableSargs', () => {
  it('should extract simple cases', () => {
    expect(findTableSargs('input', optimize(getWhere(
      'SELECT 1 WHERE input.id = 52 AND input2.name = 123;'))))
      .toEqual(getWhere('SELECT 1 WHERE input.id = 52;'));
    expect(findTableSargs('input', optimize(getWhere(
      'SELECT 1 WHERE input2.id = 52 AND input2.name = 123;'))))
      .toEqual(null);
    expect(findTableSargs('input', optimize(getWhere(
      'SELECT 1 WHERE input.id = 52 AND input.name = 123;'))))
      .toEqual(getWhere('SELECT 1 WHERE input.id = 52 AND input.name = 123;'));
  });
  it('should extract using andGraph', () => {
    expect(findTableSargs('input', optimize(getWhere(
      'SELECT 1 WHERE input2.id > 52 AND input2.id = input.id;'))))
      .toEqual(getWhere(
        'SELECT 1 WHERE input.id = input2.id AND input.id > 52;'));
  });
});
