import { Row } from '../row';

export default class InputIterator implements AsyncIterableIterator<Row[]> {
  input: Row[];
  position: number;
  constructor(input: Row[]) {
    this.input = input;
    this.position = 0;
  }
  next(limit: number = 256): Promise<IteratorResult<Row[]>> {
    let value = this.input.slice(this.position, this.position + limit);
    this.position += limit;
    return Promise.resolve({
      value,
      done: this.position >= this.input.length,
    });
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
