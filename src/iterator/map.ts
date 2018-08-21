import { Expression, SelectColumn } from 'yasqlp';
import { Row } from '../row';
import RowIterator from './type';
import compileExpression from '../expression';

export default class MapIterator implements RowIterator {
  input: RowIterator;
  where: Expression;
  parentRow: Row;
  columns: { name: string, map: (input: Row, parentRow: Row) => any }[];
  constructor(input: RowIterator, columns: SelectColumn[]) {
    this.input = input;
    // NOTE This doesn't handle distinct / all yet.
    this.columns = columns.map((column, i) => ({
      name: column.name || i.toString(),
      map: compileExpression(input.getTables(), column.value),
    }));
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    let { value, done } = await this.input.next(arg);
    if (done) return { value, done: true };
    return {
      value: value.map(entry => {
        let output = { ...entry, __result: {} as any };
        this.columns.forEach(column => {
          output.__result[column.name] = column.map(entry, this.parentRow);
        });
        return output;
      }),
      done: false,
    };
  }
  getTables() {
    return [...this.input.getTables(), '__result'];
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
    this.parentRow = parentRow;
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
