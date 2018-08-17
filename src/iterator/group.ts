import { Expression } from 'yasqlp';
import deepEqual from 'deep-equal';
import { Row } from '../row';
import RowIterator from './type';
import compileExpression, { getCode } from '../util/compileExpression';

type AggregateData = {
  min?: any,
  max?: any,
  count?: any,
  sum?: any,
  sumSquared?: any,
};

export default class GroupIterator implements RowIterator {
  input: RowIterator;
  groupTargets: ((input: Row, parentRow: Row) => any)[];
  aggregates: Expression[];
  aggregateData: AggregateData[];
  lastValue: any[];
  parentRow: Row;
  constructor(
    input: RowIterator, group: Expression[], aggregates: Expression[],
  ) {
    this.input = input;
    this.groupTargets = group.map(v => compileExpression(input.getTables(), v));
    this.aggregates = aggregates;
    // TODO Compare cardinality, ignore entry if cardinality is 1
    let originalOrder = input.getOrder();
    for (let i = 0; i < group.length; ++i) {
      if (!deepEqual(originalOrder[i].value, group[i])) {
        throw new Error('Order must match with group clause. Failed at: ' +
          getCode({ tables: input.getTables() }, group[i]));
      }
    }
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    let { value, done } = await this.input.next(arg);
    let output: Row[] = [];
    if (done) {
      // TODO Output if aggregation data is not null
      return { value, done: true };
    }
    for (let i = 0; i < value.length; ++i) {
      let row = value[i];
      let groupValue = this.groupTargets.map((evaluate) =>
        evaluate(this.parentRow, row));
      let matched = this.lastValue != null &&
        groupValue.every((v, i) => v === this.lastValue[i]);
      if (!matched) {
        // TODO Output if aggregation data is not null
        this.lastValue = groupValue;
        // TODO Initialize aggregation data
      }
    }
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
    this.lastValue = null;
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
