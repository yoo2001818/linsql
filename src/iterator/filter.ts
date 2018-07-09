import { Expression } from 'yasqlp';
import { Row } from '../row';
import compileExpression from '../util/compileExpression';

export default class FilterIterator implements AsyncIterableIterator<Row[]> {
  input: AsyncIterator<Row[]>;
  where: Expression;
  comparator: (input: Row) => any;
  constructor(input: AsyncIterator<Row[]>, where: Expression) {
    this.input = input;
    this.where = where;
    this.comparator = compileExpression(where);
  }
  async next(limit: number = 256): Promise<IteratorResult<Row[]>> {
    let { value, done } = await this.input.next();
    if (done) return { value, done: true };
    return {
      value: value.filter((v) => this.comparator(v)),
      done: false,
    };
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
