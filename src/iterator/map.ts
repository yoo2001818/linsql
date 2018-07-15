import { Expression, SelectColumn } from 'yasqlp';
import { Row } from '../row';
import RowIterator from './type';
import compileExpression from '../util/compileExpression';

export default class MapIterator implements RowIterator {
  input: RowIterator;
  where: Expression;
  columns: { name: string, map: (input: Row) => any }[];
  constructor(input: RowIterator, columns: SelectColumn[]) {
    this.input = input;
    // NOTE This doesn't handle distinct / all yet.
    this.columns = columns.map((column, i) => ({
      name: column.name || i.toString(),
      map: compileExpression(column.value),
    }));
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    let { value, done } = await this.input.next(arg);
    if (done) return { value, done: true };
    return {
      value: value.map(entry => {
        let output = { ...entry, __result: {} as any };
        this.columns.forEach(column => {
          output.__result[column.name] = column.map(entry);
        });
        return output;
      }),
      done: false,
    };
  }
  getColumns() {
    return {
      ...this.input.getColumns(),
      __result: this.columns.map(v => v.name),
    };
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
