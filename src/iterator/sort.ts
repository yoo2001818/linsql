import { OrderByRef } from 'yasqlp';

import { Row } from '../row';
import RowIterator from './type';
import drainIterator from '../util/drainIterator';
import compileExpression from '../expression';

function compileSorter(tables: string[], order: OrderByRef[]) {
  // Compile each evaluators
  let directions = order.map(ref => ref.direction === 'desc');
  let evaluators = order.map(ref => compileExpression(tables, ref.value));
  return (parentRow: Row, a: Row, b: Row) => {
    for (let i = 0; i < evaluators.length; ++i) {
      let evaluator = evaluators[i];
      let resultA = evaluator(a, parentRow);
      let resultB = evaluator(b, parentRow);
      if (directions[i]) {
        if (resultA > resultB) return -1;
        if (resultA < resultB) return 1;
      } else {
        if (resultA < resultB) return -1;
        if (resultA > resultB) return 1;
      }
    }
    return 0;
  };
}

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
