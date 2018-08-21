import { Expression } from 'yasqlp';
import { Row } from '../../row';
import RowIterator from '../type';
import compileExpression from '../../expression';
import drainIterator from '../../util/drainIterator';
import createJoinRow from '../../util/joinRow';

export default class CrossJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  parentRow: Row;
  rightCache: Row[];
  where: Expression;
  leftJoin: boolean;
  rightFiller: { [key: string]: Row };
  comparator: (input: Row, parentRow: Row) => any;
  joinRow: ReturnType<typeof createJoinRow>;
  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean = false,
  ) {
    this.left = left;
    this.right = right;
    this.where = where;
    this.leftJoin = leftJoin;
    this.comparator = compileExpression(this.getTables(), where);
    this.rightFiller = {};
    for (let key of this.right.getTables()) {
      this.rightFiller[key] = {};
    }
    this.joinRow = createJoinRow(this.left.getTables(), this.right.getTables());
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    if (this.rightCache == null) {
      this.rightCache = await drainIterator(this.right);
    }
    let { done, value } = await this.left.next(arg);
    if (done) return { done, value };
    let output = [];
    for (let i = 0; i < value.length; ++i) {
      let hit = false;
      for (let j = 0; j < this.rightCache.length; ++j) {
        let row = this.joinRow(value[i], this.rightCache[j]);
        if (this.comparator(row, this.parentRow)) {
          output.push(row);
          hit = true;
        }
      }
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
    this.parentRow = parentRow;
    this.left.rewind(parentRow);
    this.right.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
