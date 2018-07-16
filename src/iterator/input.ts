import { Row } from '../row';
import RowIterator from './type';

export default class InputIterator implements RowIterator {
  name: string;
  input: Row[];
  position: number;
  order: string[][];
  constructor(name: string, input: Row[], order?: string[]) {
    this.name = name;
    this.input = input;
    this.position = 0;
    this.order = order != null ? order.map(v => [name, v]) : null;
  }
  next(limit: number = 256): Promise<IteratorResult<Row[]>> {
    if (this.position >= this.input.length) {
      return Promise.resolve({ done: true, value: null });
    }
    let value = this.input.slice(this.position, this.position + limit)
      .map(v => ({ [this.name]: v }));
    this.position += limit;
    return Promise.resolve({ done: false, value });
  }
  getColumns() {
    return Promise.resolve({ [this.name]: Object.keys(this.input[0]) });
  }
  getOrder(): string[][] | null {
    return this.order;
  }
  rewind() {
    this.position = 0;
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
