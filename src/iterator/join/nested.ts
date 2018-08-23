import { Expression } from 'yasqlp';
import { Row } from '../../row';
import RowIterator from '../type';
import FilterIterator from '../filter';
import createJoinRow from '../../util/joinRow';

export default class NestedJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  parentRow: Row;

  leftJoin: boolean;

  rightFiller: { [key: string]: Row };

  joinRow: ReturnType<typeof createJoinRow>;

  leftBuffer: Row[] = null;
  leftPos: number = 0;

  rightOngoing: boolean = false;
  rightHit: boolean = false;

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
    if (this.leftBuffer == null || this.leftBuffer.length <= this.leftPos) {
      let { done, value } = await this.left.next(arg);
      if (done) return { done, value };
      this.leftBuffer = value;
    }
    let row = this.leftBuffer[this.leftPos];
    if (!this.rightOngoing) {
      if (this.parentRow != null) {
        this.right.rewind({ ...this.parentRow, ...row });
      } else {
        this.right.rewind(row);
      }
      this.rightOngoing = true;
      this.rightHit = false;
    }
    let output = [];
    let { done, value } = await this.right.next();
    if (done) {
      this.leftPos ++;
      this.rightOngoing = false;
      if (!this.rightHit && this.leftJoin) {
        return { done: false, value: [this.joinRow(row, this.rightFiller)] };
      }
      return this.next(arg);
    }
    for (let j = 0; j < value.length; ++j) {
      output.push(this.joinRow(row, value[j]));
      this.rightHit = true;
    }
    return { done: false, value: output };
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
    this.leftBuffer = null;
    this.leftPos = 0;
    this.rightOngoing = false;
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
