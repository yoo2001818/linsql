import { Expression } from 'yasqlp';
import deepEqual from 'deep-equal';
import { Row } from '../row';
import RowIterator from './type';
import Aggregate from '../aggregate/type';
import AggregateTypes from '../aggregate';
import compileExpression, { getCode, getAggrName }
  from '../util/compileExpression';
import drainIterator from '../util/drainIterator';
import hashCode from '../util/hashCode';

export default class GroupHashIterator implements RowIterator {
  input: RowIterator;
  groupTargets: ((input: Row, parentRow: Row) => any)[];
  aggregates: {
    name: string,
    distinct: boolean,
    create: () => Aggregate,
    evaluate: ((input: Row, parentRow: Row) => any),
  }[];
  parentRow: Row = null;
  finished: boolean = false;
  constructor(
    input: RowIterator, group: Expression[], aggregates: Expression[],
  ) {
    this.input = input;
    this.groupTargets = group.map(v => compileExpression(input.getTables(), v));
    this.aggregates = aggregates.map(aggr => {
      if (aggr.type !== 'aggregation') {
        throw new Error('Aggregate expression type must be aggregation');
      }
      let aggrCreator = AggregateTypes[aggr.name];
      if (aggrCreator == null) {
        throw new Error('Unknown aggregation ' + aggr.name);
      }
      return {
        name: getAggrName({ tables: input.getTables() }, aggr),
        distinct: aggr.qualifier === 'distinct',
        create: aggrCreator,
        evaluate: compileExpression(input.getTables(), aggr.value),
      }
    });
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    if (this.finished) {
      return { value: [], done: true };
    }

    let records: {
      row: Row,
      aggrs: Aggregate[],
    }[] = [];
    let recordsMap: { [key: number]: number } = {};

    while (true) {
      let { value, done } = await this.input.next(arg);
      if (done) break;
      for (let i = 0; i < value.length; ++i) {
        let row = value[i];
        let groupValue = this.groupTargets.map(evaluate =>
          evaluate(row, this.parentRow));
        let hash = hashCode(groupValue);
        // Initialize record if doesn't exists
        if (recordsMap[hash] == null) {
          recordsMap[hash] = records.length;
          records.push({
            row,
            aggrs: this.aggregates.map(v => {
              let aggr = v.create();
              aggr.init();
              return aggr;
            }),
          });
        }
        // Insert data in corresponding record
        let record = records[recordsMap[hash]];
        record.aggrs.forEach((aggr, i) => {
          aggr.next(this.aggregates[i].evaluate(row, this.parentRow));
        });
      }
    }

    // Aggregate result
    this.finished = true;
    return {
      value: records.map(record => {
        let aggrs: { [key: string]: any } = {};
        record.aggrs.forEach((aggr, i) => {
          aggrs[this.aggregates[i].name] = aggr.finalize();
        });
        return {
          ...record.row,
          _aggr: aggrs,
        };
      }),
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
    this.finished = false;
    return this.input.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
