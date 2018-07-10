import { Row } from '../row';
import RowIterator from './type';

export default class InputIterator implements RowIterator {
  name: string;
  input: Row[];
  position: number;
  constructor(name: string, input: Row[]) {
    this.name = name;
    this.input = input;
    this.position = 0;
  }
  next(limit: number = 256): Promise<IteratorResult<Row[]>> {
    let value = this.input.slice(this.position, this.position + limit)
      .map(v => ({ [this.name]: v }));
    this.position += limit;
    return Promise.resolve({
      value,
      done: this.position >= this.input.length,
    });
  }
  getColumns(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.input[0]));
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
