import { OrderByRef } from 'yasqlp';

import { Row } from '../row';
import RowIterator from './type';
import drainIterator from '../util/drainIterator';
import compileSorter from '../expression/sorter';

export default class SortIterator implements RowIterator {
  input: RowIterator;
  order: OrderByRef[];
  sorter: (parentRow: Row, a: Row, b: Row) => number;
  parentRow: Row;
  done: boolean;
  constructor(input: RowIterator, order: OrderByRef[]) {
    this.input = input;
    this.sorter = compileSorter(this.input.getTables(), order);
    this.order = order;
    this.done = false;
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    if (this.done) return { value: null, done: true };
    let result = await drainIterator(this.input);
    this.done = true;
    result.sort((a: Row, b: Row) => this.sorter(this.parentRow, a, b));
    return { value: result, done: false };
  }
  getTables() {
    return this.input.getTables();
  }
  getColumns() {
    return this.input.getColumns();
  }
  getOrder() {
    return this.order;
  }
  rewind(parentRow: Row) {
    this.done = false;
    this.parentRow = parentRow;
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
