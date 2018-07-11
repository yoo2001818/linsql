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
  comparator: (input: Row) => any;
  constructor(left: RowIterator, right: RowIterator, where: Expression) {
    this.left = left;
    this.right = right;
    this.where = where;
    this.comparator = compileExpression(where);
  }
  async next(): Promise<IteratorResult<Row[]>> {
    if (this.rightCache != null) {
      this.rightCache = await drainIterator(this.right);
    }
    let { done, value } = await this.left.next();
    let output = [];
    for (let i = 0; i < value.length; ++i) {
      for (let j = 0; j < this.rightCache.length; ++j) {
        let row = { ...value[i], ...this.rightCache[j] };
        if (this.comparator(row)) output.push(row);
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
