import parse, { Statement } from 'yasqlp';

import InputIterator from './iterator/input';
import FilterIterator from './iterator/filter';

import { Row } from './row';

export default function planner(sql: string) {
  let statements: Statement[] = parse(sql);
  let statement = statements[0];
  if (statement == null || statement.type !== 'select') {
    throw new Error('Only select statement is supported for now');
  }
  let input = statement.from[0];
  if (input.table.value.type !== 'values') {
    throw new Error('Only table is supported')
  }
  let iterator: AsyncIterableIterator<Row[]> =
    new InputIterator(input.table.value.value);
  iterator = new FilterIterator(iterator, statement.where);
  return iterator;
}
