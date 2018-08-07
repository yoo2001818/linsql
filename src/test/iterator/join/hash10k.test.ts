import parse, { Expression } from 'yasqlp';

import InputIterator from '../../../iterator/input';
import HashJoinIterator from '../../../iterator/join/hash';
import RowIterator from '../../../iterator/type';

import drainIterator from '../../../util/drainIterator';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select stement');
}

describe('HashJoinIterator (1000 * 10)', () => {
  // Generate parent table, and child table, for 1:n relation.
  // Parent table has 1000 rows, and they have 10 rows children each. That's
  // 10k rows - thus O(1000 + 10000).
  let parentDataset: any[] = [];
  let childDataset: any[] = [];
  for (let i = 0; i < 1000; ++i) {
    parentDataset.push({ id: i, name: 'A test ' + i });
    for (let j = 0; j < 10; ++j) {
      childDataset.push({ id: i * 10 + j, parent_id: i, name: 'Child ' + j });
    }
  }
  let iter: RowIterator;
  let iter2: RowIterator;
  beforeEach(() => {
    iter = new InputIterator('parents', parentDataset);
    iter2 = new InputIterator('children', childDataset);
  });
  it('should run', async () => {
    iter = new HashJoinIterator(iter, iter2, getWhere(
      'SELECT 1 WHERE parents.id = children.parent_id;'));
    await drainIterator(iter);
  });
});
