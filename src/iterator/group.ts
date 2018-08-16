import { Expression } from 'yasqlp';
import { Row } from '../row';
import RowIterator from './type';
import compileExpression from '../util/compileExpression';

export default class GroupIterator implements RowIterator {
  input: RowIterator;
  groupTargets: ((input: Row, parentRow: Row) => any)[];
  aggregates: Expression[];
  lastValue: any[];
  parentRow: Row;
  constructor(
    input: RowIterator, group: Expression[], aggregates: Expression[],
  ) {
    this.input = input;
    this.groupTargets = group.map(v => compileExpression(input.getTables(), v));
    this.aggregates = aggregates;
    // TODO Ensure getOrder matches with group targets
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    let { value, done } = await this.input.next(arg);
    if (done) return { value, done: true };
    // TODO
    return {
      value,
      done: false,
    };
  }
  getTables() {
    return [...this.input.getTables(), '_aggr'];
  }
  getColumns() {
    return this.input.getColumns();
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
