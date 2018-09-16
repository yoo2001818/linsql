import parse, { Expression } from 'yasqlp';
import { performance } from 'perf_hooks';

import InputIterator from './iterator/input';
import HashJoinIterator from './iterator/join/hash';

import drainIterator from './util/drainIterator';

function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select statement');
}

// Generate parent table, and child table, for 1:n relation.
// Parent table has 1000 rows, and they have 10 rows children each. That's
// 10k rows - thus O(1000 + 10000).
let parentDataset: any[] = [];
let childDataset: any[] = [];
for (let i = 0; i < 1000; ++i) {
  parentDataset.push({ id: i, name: 'A test ' + i });
  for (let j = 0; j < 1000; ++j) {
    childDataset.push({ id: i * 10 + j, parent_id: i, name: 'Child ' + j });
  }
}

async function test() {
  let now = performance.now();
  for (let i = 0; i < 10; ++i) {
    let iter = new InputIterator('parents', parentDataset);
    let iter2 = new InputIterator('children', childDataset);
    let iter3 = new HashJoinIterator(iter2, iter, getWhere(
      'SELECT 1 WHERE parents.id = children.parent_id;'));
    while (!(await iter3.next()).done);
  }
  console.log('Took ' + (performance.now() - now) / 10);
}

test();

setInterval(() => {}, 1000);
