import { Expression } from 'yasqlp';
import Heap from 'heap';
import { Row } from '../../row';
import planHashJoin, { HashJoinPlan } from '../../hashJoinPlanner';
import RowIterator from '../type';
import compileExpression from '../../util/compileExpression';
import hashCode from '../../util/hashCode';
import drainIterator from '../../util/drainIterator';

export default class HashJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  leftJoin: boolean;
  rightCache: Row[];
  rightFiller: { [key: string]: Row };
  tables: { [key: string]: number[] }[];
  plan: HashJoinPlan;
  comparator: (input: Row) => any;
  tablePlans: { tableId: number, evaluate: (row: Row) => any }[];
  comparePlans: { tableId: number, evaluate: (row: Row) => any }[];
  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean = false,
  ) {
    this.left = left;
    this.right = right;
    this.leftJoin = leftJoin;
    // Build hash join plan
    this.plan = planHashJoin(where,
      this.left.getTables(), this.right.getTables());
    this.comparator = compileExpression(where);
    // Compile plan to evaluatable plans
    this.tablePlans = [];
    this.plan.tables.forEach((desc, tableId) => {
      desc.forEach(columns => {
        let evalColumns = columns.map(v => compileExpression(v));
        this.tablePlans.push({
          tableId,
          evaluate: (row: Row) => evalColumns.map((evaluate) => evaluate(row)),
        });
      });
    });
    this.comparePlans = this.plan.compares.map((desc) => {
      let evalColumns = desc.value.map(v => compileExpression(v));
      return {
        tableId: desc.tableId,
        evaluate: (row: Row) => evalColumns.map((evaluate) => evaluate(row)),
      };
    });
    this.rightFiller = {};
    for (let key of this.right.getTables()) {
      this.rightFiller[key] = {};
    }
  }
  async next(arg: any): Promise<IteratorResult<Row[]>> {
    if (this.rightCache == null) {
      this.rightCache = [];
      this.tables = this.plan.tables.map(() => ({}));
      // Fetch and put each row to hash table
      let it = this.right;
      let rowId = 0;
      while (true) {
        let result = await it.next(arg);
        if (result.done) break;
        let rows = result.value;
        for (let i = 0; i < rows.length; ++i) {
          let row = rows[i];
          this.rightCache.push(row);
          this.tablePlans.forEach((plan) => {
            let hash = hashCode(plan.evaluate(row));
            let table = this.tables[plan.tableId];
            if (table[hash] == null) {
              table[hash] = [rowId];
            } else {
              table[hash].push(rowId);
            }
          });
          rowId ++;
        }
      }
    }
    // After generating hash table, compare against them.
    let { done, value } = await this.left.next();
    if (done) return { done, value };
    let output: Row[] = [];
    for (let i = 0; i < value.length; ++i) {
      let row = value[i];
      let hit = false;
      this.comparePlans.forEach((plan) => {
        let hash = hashCode(plan.evaluate(row));
        let table = this.tables[plan.tableId];
        if (table[hash] != null) {
          table[hash].forEach(rowId => {
            hit = true;
            output.push({ ...row, ...this.rightCache[rowId] });
          });
        }
      });
      if (!hit && this.leftJoin) {
        output.push({ ...value[i], ...this.rightFiller });
      }
    }
    return { done, value: output };
  }
  getTables() {
    return [...this.left.getTables(), ...this.right.getTables()];
  }
  async getColumns() {
    return {
      ...(await this.left.getColumns()),
      ...(await this.right.getColumns()),
    };
  }
  getOrder() {
    let leftOrder = this.left.getOrder();
    if (leftOrder == null) return null;
    let rightOrder = this.right.getOrder();
    if (rightOrder == null) return leftOrder;
    return [...leftOrder, ...rightOrder];
  }
  rewind(parentRow: Row) {
    this.rightCache = null;
    this.tables = null;
    this.left.rewind(parentRow);
    this.right.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
