import parse from 'yasqlp';
import planTable from './planner/planTable';
import optimize from './expression/optimize';
import { getWhere, getOrderBy } from './util/select';
import { NormalTable } from './table';

let randTable: { [key: string]: string[] } = {
  a: ['a', 'b', 'c', 'aab', 'baa', 'bee', 'bee', 'bee', 'coo'],
  b: ['a', 'b', 'c', 'aab', 'baa', 'bee', 'bee', 'bee', 'coo'],
  c: ['a', 'b', 'c', 'aab', 'baa', 'bee', 'bee', 'bee', 'coo'],
};
let testData: any[] = [];
// Generate test data...
for (let i = 0; i < 100000; i += 1) {
  let output: { [key: string]: string } = {};
  for (let key in randTable) {
    output[key] = randTable[key][randTable[key].length * Math.random() | 0];
  }
  testData.push(output);
}
// Create index information
let indexData: { [key: string]: any[] } = {};


let table: NormalTable = {
  type: 'normal',
  name: 'a',
  columns: [],
  indexes: [
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
  ],
  order: [],
  count: 1000,
  fetch: null,
};

planTable('a', table, optimize(
  getWhere('SELECT * FROM a WHERE a.a > 3 OR (a.a = 3 AND a.b >= 2);')));

planTable('a', table, optimize(
  getWhere('SELECT * FROM a WHERE a.a = 3 OR a.b = 4 OR a.a = 6;')),
  getOrderBy('SELECT 1 ORDER BY a.b;'));
