import parse from 'yasqlp';
import planTable from './planner/planTable';
import optimize from './expression/optimize';
import { getWhere } from './util/select';
import { NormalTable } from './table';

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
  ],
  order: [],
  count: 1000,
  fetch: null,
};

planTable('a', table, optimize(
  getWhere('SELECT * FROM a WHERE a.a > 3 OR (a.a = 3 AND a.b >= 2);')));

planTable('a', table, optimize(
  getWhere('SELECT * FROM a WHERE a.a = 3 OR a.b = 4 OR a.a = 6;')));
