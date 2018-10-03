import { Expression } from 'yasqlp';
import { Row } from '../../row';
import planHashJoin, { HashJoinPlan } from '../../planner/hashJoin';
import RowIterator from '../type';
import compileExpression from '../../expression/compile';
import hashCode from '../../util/hashCode';
import createJoinRow from '../../util/joinRow';

export default class HashJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  parentRow: Row;

  leftJoin: boolean;

  rightCache: Row[];
  rightFiller: { [key: string]: Row };
  tables: { [key: string]: number[] }[];

  plan: HashJoinPlan;
  comparator: (input: Row, parentRow: Row) => any;

  tablePlans: { tableId: number, evaluate: (row: Row) => any }[];
  comparePlans: { tableId: number, evaluate: (row: Row) => any }[];

  joinRow: ReturnType<typeof createJoinRow>;

  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean = false,
  ) {
    this.left = left;
    this.right = right;
    this.leftJoin = leftJoin;
    // Build hash join plan
    this.plan = planHashJoin(where,
      this.left.getTables(), this.right.getTables());
    this.comparator = compileExpression(this.getTables(), where);
    // Compile plan to evaluatable plans
    this.tablePlans = [];
    this.plan.tables.forEach((desc, tableId) => {
      desc.forEach(columns => {
        let evalColumns = columns.map(v =>
          compileExpression(right.getTables(), v));
        this.tablePlans.push({
          tableId,
          evaluate: (row: Row) => evalColumns.map((evaluate) =>
            evaluate(row, this.parentRow)),
        });
      });
    });
    this.comparePlans = this.plan.compares.map((desc) => {
      let evalColumns = desc.value.map(v =>
        compileExpression(left.getTables(), v));
      return {
        tableId: desc.tableId,
        evaluate: (row: Row) => evalColumns.map((evaluate) =>
          evaluate(row, this.parentRow)),
      };
    });
    this.rightFiller = {};
    for (let key of this.right.getTables()) {
      this.rightFiller[key] = {};
    }
    this.joinRow = createJoinRow(this.left.getTables(), this.right.getTables());
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
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
      // Use simple 32 length long hash table for conflict detection.
      let conflictTable: number[][] = [];
      this.comparePlans.forEach((plan) => {
        let hash = hashCode(plan.evaluate(row));
        let table = this.tables[plan.tableId];
        if (table[hash] != null) {
          table[hash].forEach(rowId => {
            let conflicts = conflictTable[rowId & 31];
            if (conflicts != null && conflicts.includes(rowId)) return;
            hit = true;
            if (conflicts != null) conflicts.push(rowId);
            else conflictTable[rowId & 31] = [rowId];
            let resultRow = this.joinRow(row, this.rightCache[rowId]);
            if (!this.plan.complete &&
              !this.comparator(resultRow, this.parentRow)
            ) {
              return;
            }
            output.push(resultRow);
          });
        }
      });
      if (!hit && this.leftJoin) {
        output.push(this.joinRow(value[i], this.rightFiller));
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
  rewind(parentRow?: Row) {
    this.rightCache = null;
    this.tables = null;
    this.parentRow = parentRow;
    this.left.rewind(parentRow);
    this.right.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
