import { Expression } from 'yasqlp';
import { Row } from '../../row';
import planHashJoin, { HashJoinPlan } from '../../hashJoinPlanner';
import RowIterator from '../type';
import compileExpression from '../../util/compileExpression';
import drainIterator from '../../util/drainIterator';

export default class HashJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  leftJoin: boolean;
  tables: { [key: string]: any }[];
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
      let it = this.left;
      while (true) {
        let result = await it.next(arg);
        if (result.done) break;
      }
    }
  }
  getTables() {
    return [...this.left.getTables(), ...this.right.getTables()];
  }
}
