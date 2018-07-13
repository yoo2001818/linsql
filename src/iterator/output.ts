import { Row } from '../row';
import RowIterator from './type';

export default class OutputIterator implements RowIterator {
  input: RowIterator;
  name: string | null;
  constructor(input: RowIterator, name?: string) {
    this.input = input;
    this.name = name;
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    let { value, done } = await this.input.next(arg);
    if (done) return { value, done: true };
    return {
      value: value.map(entry => {
        if (this.name == null) return entry.__result;
        return { [this.name]: entry.__result };
      }),
      done: false,
    };
  }
  async getColumns() {
    if (this.name != null) {
      return { [this.name]: (await this.input.getColumns()).__result };
    } else {
      // TODO
      return {};
    }
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
