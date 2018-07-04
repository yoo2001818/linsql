import { Row } from '../row';

export default class InputIterator implements Iterator<Row> {
  input: Row[];
  position: number;
  constructor(input: Row[]) {
    this.input = input;
    this.position = 0;
  }
  next(): IteratorResult<Row> {
    let value = this.input[this.position ++];
    return {
      value,
      done: this.position >= this.input.length,
    }
  }
  [Symbol.iterator]() {
    return this;
  }
}
