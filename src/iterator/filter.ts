import { Expression } from 'yasqlp';
import { Row } from '../row';
import RowIterator from './type';
import compileExpression from '../util/compileExpression';

export default class FilterIterator implements RowIterator {
  input: RowIterator;
  where: Expression;
  comparator: (input: Row) => any;
  constructor(input: RowIterator, where: Expression) {
    this.input = input;
    this.where = where;
    this.comparator = compileExpression(where);
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    let { value, done } = await this.input.next(arg);
    if (done) return { value, done: true };
    return {
      value: value.filter(v => this.comparator(v)),
      done: false,
    };
  }
  getTables() {
    return this.input.getTables();
  }
  getColumns() {
    return this.input.getColumns();
  }
  getOrder() {
    return this.input.getOrder();
  }
  rewind(parentRow: Row) {
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
