import { Expression } from 'yasqlp';
import { Row } from '../../row';
import RowIterator from '../type';
import FilterIterator from '../filter';
import drainIterator from '../../util/drainIterator';
import createJoinRow from '../../util/joinRow';

export default class NestedJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  parentRow: Row;
  leftJoin: boolean;
  rightFiller: { [key: string]: Row };
  joinRow: ReturnType<typeof createJoinRow>;
  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean = false,
  ) {
    this.left = left;
    this.right = right;
    if (where != null) {
      this.right = new FilterIterator(this.right, where);
    }
    this.leftJoin = leftJoin;
    this.rightFiller = {};
    for (let key of this.right.getTables()) {
      this.rightFiller[key] = {};
    }
    this.joinRow = createJoinRow(this.left.getTables(), this.right.getTables());
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    let { done, value } = await this.left.next(arg);
    if (done) return { done, value };
    let output = [];
    for (let i = 0; i < value.length; ++i) {
      let hit = false;
      if (this.parentRow != null) {
        this.right.rewind({ ...this.parentRow, ...value[i] });
      } else {
        this.right.rewind(value[i])
      }
      let rowOutput = await drainIterator(this.right);
      for (let j = 0; j < rowOutput.length; ++j) {
        output.push(this.joinRow(value[i], rowOutput[j]));
        hit = true;
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
    this.parentRow = parentRow;
    this.left.rewind(parentRow);
    this.right.rewind(parentRow);
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
