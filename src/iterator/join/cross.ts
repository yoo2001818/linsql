import { Expression } from 'yasqlp';
import { Row } from '../../row';
import RowIterator from '../type';
import compileExpression from '../../util/compileExpression';
import drainIterator from '../../util/drainIterator';

export default class CrossJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  rightCache: Row[];
  where: Expression;
  leftJoin: boolean;
  rightFiller: { [key: string]: Row };
  comparator: (input: Row) => any;
  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean,
  ) {
    this.left = left;
    this.right = right;
    this.where = where;
    this.leftJoin = leftJoin;
    this.comparator = compileExpression(where);
  }
  async next(): Promise<IteratorResult<Row[]>> {
    if (this.rightCache == null) {
      this.rightCache = await drainIterator(this.right);
    }
    if (this.leftJoin && this.rightFiller == null) {
      this.rightFiller = {};
      for (let key in await this.right.getColumns()) {
        this.rightFiller[key] = {};
      }
    }
    let { done, value } = await this.left.next();
    let output = [];
    for (let i = 0; i < value.length; ++i) {
      let hit = false;
      for (let j = 0; j < this.rightCache.length; ++j) {
        let row = { ...value[i], ...this.rightCache[j] };
        if (this.comparator(row)) {
          output.push(row);
          hit = true;
        }
      }
      if (!hit && this.leftJoin) {
        output.push({ ...value[i], ...this.rightFiller });
      }
    }
    return { done, value: output };
  }
  async getColumns() {
    return {
      ...(await this.left.getColumns()),
      ...(await this.right.getColumns()),
    };
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
