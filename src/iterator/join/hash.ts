import { Expression } from 'yasqlp';
import objectHash from 'object-hash';
import { Row } from '../../row';
import planHashJoin, { HashJoinPlan } from '../../hashJoinPlanner';
import RowIterator from '../type';
import compileExpression from '../../util/compileExpression';
import drainIterator from '../../util/drainIterator';

export default class HashJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  leftJoin: boolean;
  tables: { [key: string]: Row[] }[];
  plan: HashJoinPlan;
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
  }
  async next(arg: any): Promise<IteratorResult<Row[]>> {
    if (this.tables == null) {
      this.tables = this.plan.tables.map(() => ({}));
      // Fetch and put each row to hash table
      let it = this.right;
      while (true) {
        let result = await it.next(arg);
        if (result.done) break;
        let rows = result.value;
        for (let i = 0; i < rows.length; ++i) {
          let row = rows[i];
          this.tablePlans.forEach((plan) => {
            let hash = objectHash(plan.evaluate(row));
            let table = this.tables[plan.tableId];
            if (table[hash] == null) {
              table[hash] = [row];
            } else {
              table[hash].push(row);
            }
          });
        }
      }
    }
    // After generating hash table, compare against them.
    let { done, value } = await this.left.next();
    if (done) return { done, value };
    let output: Row[] = [];
    for (let i = 0; i < value.length; ++i) {
      let row = value[i];
      // TODO Dedupe exactly same output
      this.comparePlans.forEach((plan) => {
        let hash = objectHash(plan.evaluate(row));
        let table = this.tables[plan.tableId];
        if (table[hash] != null) {
          table[hash].forEach((otherRow) => {
            let newRow = { ...row, ...otherRow };
            output.push(newRow);
          });
        }
      });
    }
    return { done, value: output };
  }
  getTables() {
    return [...this.left.getTables(), ...this.right.getTables()];
  }
}
