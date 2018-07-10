import parse, { Statement } from 'yasqlp';

import InputIterator from './iterator/input';
import FilterIterator from './iterator/filter';
import RowIterator from './iterator/type';

import { Row } from './row';

export default function planner(sql: string, tables: { [key: string]: Row[] }) {
  let statements: Statement[] = parse(sql);
  let statement = statements[0];
  if (statement == null || statement.type !== 'select') {
    throw new Error('Only select statement is supported for now');
  }
  let input = statement.from[0];
  if (input.table.value.type !== 'table') {
    throw new Error('Only table is supported');
  }
  let inputName = input.table.value.name;
  let iterator: RowIterator =
    new InputIterator(inputName, tables[inputName]);
  iterator = new FilterIterator(iterator, statement.where);
  return iterator;
}
