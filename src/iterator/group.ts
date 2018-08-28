import { Expression } from 'yasqlp';
import deepEqual from 'deep-equal';
import { Row } from '../row';
import RowIterator from './type';
import Aggregate from '../aggregate/type';
import AggregateTypes from '../aggregate';
import compileExpression, { getCode, getAggrName }
  from '../expression';

export default class GroupIterator implements RowIterator {
  input: RowIterator;
  groupTargets: ((input: Row, parentRow: Row) => any)[];
  aggregates: {
    name: number,
    distinct: boolean,
    data: Aggregate,
    evaluate: ((input: Row, parentRow: Row) => any),
  }[];
  lastValue: any[] = null;
  lastRow: Row = null;
  parentRow: Row = null;
  finished: boolean = false;
  constructor(
    input: RowIterator, group: Expression[], aggregates: Expression[],
  ) {
    this.input = input;
    this.groupTargets = group.map(v => compileExpression(input.getTables(), v));
    this.aggregates = aggregates.map((aggr, i) => {
      if (aggr.type !== 'aggregation') {
        throw new Error('Aggregate expression type must be aggregation');
      }
      let aggrCreator = AggregateTypes[aggr.name];
      if (aggrCreator == null) {
        throw new Error('Unknown aggregation ' + aggr.name);
      }
      return {
        name: i,
        distinct: aggr.qualifier === 'distinct',
        data: aggrCreator(),
        evaluate: compileExpression(input.getTables(), aggr.value),
      }
    });
    // TODO Compare cardinality, ignore entry if cardinality is 1
    let originalOrder = input.getOrder();
    for (let i = 0; i < group.length; ++i) {
      if (!deepEqual(originalOrder[i].value, group[i])) {
        throw new Error('Order must match with group clause. Failed at: ' +
          getCode({ tables: input.getTables() }, group[i]));
      }
    }
  }
  getResultRow(): Row {
    let aggrs: { [key: string]: any } = {};
    this.aggregates.forEach(aggr => {
      aggrs[aggr.name] = aggr.data.finalize();
    });
    return {
      ...this.lastRow,
      _aggr: aggrs,
    };
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    if (this.finished) {
      return { value: [], done: true };
    }
    let { value, done } = await this.input.next(arg);
    let output: Row[] = [];
    if (done) {
      // Output if aggregation data is not null
      if (this.lastValue != null) {
        output.push(this.getResultRow());
        this.lastValue = null;
        return { value: output, done: false };
      } else {
        return { value: [], done: true };
      }
    }
    for (let i = 0; i < value.length; ++i) {
      let row = value[i];
      let groupValue = this.groupTargets.map(evaluate =>
        evaluate(row, this.parentRow));
      let matched = this.lastValue != null &&
        groupValue.every((v, i) => v === this.lastValue[i]);
      if (!matched) {
        // Output if aggregation data is not null
        if (this.lastValue != null) output.push(this.getResultRow());
        this.lastValue = groupValue;
        this.lastRow = row;
        // Initialize aggregation data
        this.aggregates.forEach(aggr => aggr.data.init());
      }
      this.aggregates.forEach(aggr => {
        let value = aggr.evaluate(row, this.parentRow);
        aggr.data.next(value);
      });
    }
    return { value: output, done: false };
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
    this.lastRow = null;
    this.finished = false;
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
