import { Row } from '../row';
import RowIterator from './type';

export default class LimitIterator implements RowIterator {
  input: RowIterator;
  offset: number;
  start: number;
  end: number;
  constructor(input: RowIterator, limit: number, offset?: number) {
    this.input = input;
    this.start = offset == null ? 0 : offset;
    this.end = this.start + limit;
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    if (this.offset >= this.end) return { value: null, done: true };
    // Call next until start is reached.
    let value;
    if (this.offset < this.start) {
      let iterResult;
      do {
        iterResult = await this.input.next(arg);
        if (iterResult.done) return { value: null, done: true };
      } while (this.offset + iterResult.value.length >= this.start);
      this.offset = this.start;
      value = iterResult.value.slice(this.start - this.offset);
    } else {
      let iterResult = await this.input.next(arg);
      if (iterResult.done) return { value: null, done: true };
      value = iterResult.value;
    }
    if (this.end - this.offset > value.length) {
      this.offset = this.end;
      return { value: value.slice(0, this.end - this.offset), done: false };
    } else {
      this.offset += value.length;
      return { value, done: false };
    }
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
    this.offset = 0;
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
