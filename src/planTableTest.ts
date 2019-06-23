import parse from 'yasqlp';
import planTable from './planner/planTable';
import optimize from './expression/optimize';
import { getWhere, getOrderBy } from './util/select';
import { NormalTable, Index } from './table';

let randTable: { [key: string]: string[] } = {
  a: ['a', 'b', 'c', 'aab', 'baa', 'bee', 'bee', 'bee', 'coo'],
  b: ['a', 'b', 'c', 'aab', 'baa', 'bee', 'bee', 'bee', 'coo'],
  c: ['a', 'b', 'c', 'aab', 'baa', 'bee', 'bee', 'bee', 'coo'],
};
let testData: any[] = [];
// Generate test data...
for (let i = 0; i < 10000; i += 1) {
  let output: { [key: string]: string } = {};
  for (let key in randTable) {
    output[key] = randTable[key][randTable[key].length * Math.random() | 0];
  }
  testData.push(output);
}
// Create index information
let indexList: Index[] = [
  {
    name: 'a',
    order: [{ key: 'a', type: 'string', order: false }],
    unique: false,
    cardinality: 0,
    count: 0,
  },
  {
    name: 'b',
    order: [{ key: 'b', type: 'string', order: false }],
    unique: false,
    cardinality: 0,
    count: 0,
  },
  {
    name: 'a_b',
    order: [
      { key: 'a', type: 'string', order: false },
      { key: 'b', type: 'string', order: false },
    ],
    unique: false,
    cardinality: 0,
    count: 0,
  },
  {
    name: 'a_b_c',
    order: [
      { key: 'a', type: 'string', order: false },
      { key: 'b', type: 'string', order: false },
      { key: 'c', type: 'string', order: false },
    ],
    unique: false,
    cardinality: 0,
    count: 0,
  },
];
let indexData: { [key: string]: any[] } = {};
indexList.forEach((index) => {
  let values: any[] = testData.slice();
  let order = index.order;
  values.sort((a, b) => {
    for (let i = 0; i < order.length; i += 1) {
      let { key } = order[i];
      if (a[key] > b[key]) return 1;
      if (a[key] < b[key]) return -1;
    }
    return 0;
  });
  indexData[index.name] = values;
});

function findMin<T, V>(
  list: T[],
  value: V,
  compare: (a: V, b: V) => number,
  getValue: (entry: T) => V,
): { pos: number, match: boolean } {
  let min = 0;
  let max = list.length - 1;
  while (min <= max) {
    const mid = Math.floor((min + max) / 2);
    const comp = compare(getValue(list[mid]), value);
    if (comp < 0) {
      min = mid + 1;
    } else if (comp > 0) {
      max = mid - 1;
    } else {
      return { pos: mid, match: true };
    }
  }
  return { pos: min, match: false };
}

function findMax<T, V>(
  list: T[],
  value: V,
  compare: (a: V, b: V) => number,
  getValue: (entry: T) => V,
): { pos: number, match: boolean } {
  let min = 0;
  let max = list.length - 1;
  while (min <= max) {
    const mid = Math.floor((min + max) / 2);
    const comp = compare(getValue(list[mid]), value);
    if (comp < 0) {
      min = mid + 1;
    } else if (comp > 0) {
      max = mid - 1;
    } else {
      return { pos: mid, match: true };
    }
  }
  return { pos: min, match: false };
}

let table: NormalTable = {
  type: 'normal',
  name: 'a',
  columns: [],
  indexes: indexList,
  order: [],
  count: 1000,
  fetch: null,
  getStatistics: (name, low, high, lte, gte) => {
    let indexMeta = indexList.find(v => v.name === name);
    let index = indexData[name];
    const compare = (a: any, b: any) => 0;
    const getValue = (v: any) => indexMeta.order.map(k => v[k.key]);
    return {
      count: 
        findMax(index, high, compare, getValue).pos - 
        findMin(index, low, compare, getValue).pos,
    }
  },
};

console.dir(planTable('a', table, optimize(
  getWhere('SELECT * FROM a WHERE a.a > 3 OR (a.a = 3 AND a.b >= 2);'))),
  { depth: null });

console.dir(planTable('a', table, optimize(
  getWhere('SELECT * FROM a WHERE a.a = 3 OR a.b = 4 OR a.a = 6;')),
  getOrderBy('SELECT 1 ORDER BY a.b;')),
  { depth: null });
