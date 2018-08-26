import { Row } from '../row';
import RowIterator from './type';

export default class LimitIterator implements RowIterator {
  input: RowIterator;
  offset: number;
  start: number;
  end: number;
  constructor(input: RowIterator, limit: number, offset?: number) {
    this.input = input;
    this.offset = 0;
    this.start = offset == null ? 0 : offset;
    this.end = this.start + limit;
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    if (this.offset >= this.end) return { value: null, done: true };
    let value;
    // If start hasn't reached, we have to slice to the start.
    if (this.offset < this.start) {
      // Call next until start is reached.
      let iterResult;
      let offset = 0;
      do {
        iterResult = await this.input.next(arg);
        if (iterResult.done) return { value: null, done: true };
        offset += iterResult.value.length;
      } while (offset <= this.start);
      this.offset = this.start;
      value = iterResult.value.slice(this.start - offset);
    } else {
      // Just call next.
      let iterResult = await this.input.next(arg);
      if (iterResult.done) return { value: null, done: true };
      value = iterResult.value;
    }
    // If end is reached, slice to the end.
    if (this.end - this.offset < value.length) {
      value = value.slice(0, this.end - this.offset);
      this.offset = this.end;
      return { value, done: false };
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
  rewind(parentRow?: Row) {
    this.offset = 0;
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
