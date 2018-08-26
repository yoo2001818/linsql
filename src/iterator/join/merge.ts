import { Expression } from 'yasqlp';
import { Row } from '../../row';
import RowIterator from '../type';
import compileExpression from '../../expression';
import { compileJoinSorter } from '../../expression/sorter';
import createJoinRow from '../../util/joinRow';
import planMergeJoin from '../../planner/mergeJoin';

export default class MergeJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  parentRow: Row;

  leftJoin: boolean;
  rightJoin: boolean;

  leftCache: Row[] = null;
  leftPos: number;
  leftDone: boolean = false;
  rightCache: Row[] = null;
  rightPos: number;
  rightDone: boolean = false;
  rightBuffer: Row[] = [];
  rightBufferIgnore: boolean = false;

  start: number;
  end: number;

  leftFiller: { [key: string]: Row };
  rightFiller: { [key: string]: Row };

  sorter: (parentRow: Row, left: Row, right: Row) => number;
  comparator: (input: Row, parentRow: Row) => any;
  joinRow: ReturnType<typeof createJoinRow>;

  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean = false, rightJoin: boolean = false,
  ) {
    this.left = left;
    this.right = right;

    this.leftJoin = leftJoin;
    this.rightJoin = rightJoin;

    let plan = planMergeJoin(where, left.getTables(), right.getTables(),
      left.getOrder(), right.getOrder());
    if (plan.end === 0) {
      throw new Error('Merge join is not possible for given expression');
    }
    this.start = plan.start;
    this.end = plan.end;

    this.sorter = compileJoinSorter(
      left.getTables(), left.getOrder().slice(this.start, this.end),
      right.getTables(), right.getOrder().slice(this.start, this.end),
    );
    this.comparator = compileExpression(this.getTables(), where);

    this.leftFiller = {};
    for (let key of this.left.getTables()) {
      this.leftFiller[key] = {};
    }
    this.rightFiller = {};
    for (let key of this.right.getTables()) {
      this.rightFiller[key] = {};
    }
    this.joinRow = createJoinRow(this.left.getTables(), this.right.getTables());
  }
  async next(arg?: any): Promise<IteratorResult<Row[]>> {
    // Fetch cache if one of them has run out.
    if (this.leftCache == null || this.leftPos >= this.leftCache.length) {
      let { value, done } = await this.left.next(arg);
      if (done) {
        this.leftCache = null;
        this.leftDone = true;
      } else {
        this.leftCache = value;
        this.leftPos = 0;
      }
    }
    if (this.rightCache == null || this.rightPos >= this.rightCache.length) {
      let { value, done } = await this.right.next(arg);
      if (done) {
        this.rightCache = null;
        this.rightDone = true;
      } else {
        this.rightCache = value;
        this.rightPos = 0;
      }
    }
    let output: Row[] = [];
    // Continue until one of the buffer drains out.
    if (!this.leftDone && !this.rightDone) {
      while (this.leftPos < this.leftCache.length &&
        this.rightPos < this.rightCache.length
      ) {
        let leftRow = this.leftCache[this.leftPos];
        let rightRow = this.rightCache[this.rightPos];
        let compared = this.sorter(this.parentRow, leftRow, rightRow);
        // If the relation is one-to-many, we just have to advance 'many'
        // side, however, if the relation is many-to-many, we have to create
        // lookbefore buffer in the memory.
        // Since we don't know what data is 'one', we have to handle all
        // cases of merge join.
        //
        // However, we assume one-to-many join by default, so it can work
        // with only one buffer in that case, otherwise it'll use buffers
        // intensively.
        // 
        // The algorithm is the following:
        // If both values are same:
        //  - Push right value to the buffer.
        //  - Put joined value into the output.
        //  - Set buffer ignore to true.
        //  - Advance right.
        // If left < right:
        //  - If the buffer is empty, add left join empty pair.
        //  - If the buffer is not empty, and buffer ignore is false,
        //    - Check if the buffer's value is smaller than the right row.
        //    - If it equals, create joined value and put into the output.
        //    - If it's smaller, clear the buffer.
        //  - Set buffer ignore to false.
        //  - Advance left.
        // If left > right:
        //  - Add right join empty pair.
        //  - Clear the buffer.
        //  - Set buffer ignore to false.
        //  - Advance right.
        if (compared === 0) {
          let resultRow = this.joinRow(leftRow, rightRow);
          if (this.comparator(resultRow, this.parentRow)) {
            output.push(resultRow);
          }
          if (!this.rightBufferIgnore) this.rightBuffer = [];
          this.rightBufferIgnore = true;
          this.rightBuffer.push(rightRow);
          this.rightPos ++;
        } else if (compared > 0) {
          // left key > right key: fetch right
          output.push(this.joinRow(this.leftFiller, rightRow));
          this.rightBuffer = [];
          this.rightBufferIgnore = false;
          this.rightPos ++;
        } else {
          // left key < right key: fetch left
          if (this.rightBuffer.length > 0 && !this.rightBufferIgnore) {
            // Compare the first value of buffer.
            let compared = this.sorter(this.parentRow,
              leftRow, this.rightBuffer[0]);
            // If buffer's first value is different from left value, 
            // clear the buffer.
            if (compared === 0) {
              this.rightBuffer.forEach(rightRow => {
                let resultRow = this.joinRow(leftRow, rightRow);
                if (this.comparator(resultRow, this.parentRow)) {
                  output.push(resultRow);
                }
              });
            } else {
              this.rightBuffer = [];
            }
          }
          if (this.rightBuffer.length === 0 && this.leftJoin) {
            // Handle left join.
            output.push(this.joinRow(leftRow, this.rightFiller));
          }
          this.rightBufferIgnore = false;
          this.leftPos ++;
        }
      }
    } else if (this.leftDone && !this.rightDone) {
      if (!this.rightJoin) return { done: true, value: null };
      while (this.rightPos < this.rightCache.length) {
        // Handle right join
        let rightRow = this.rightCache[this.rightPos];
        output.push(this.joinRow(this.leftFiller, rightRow));
        this.rightPos ++;
      }
    } else if (!this.leftDone && this.rightDone) {
      if (!this.leftJoin &&
        !(this.rightBuffer.length > 0 || this.rightBufferIgnore)
      ) {
        return { done: true, value: null };
      }
      while (this.leftPos < this.leftCache.length) {
        let leftRow = this.leftCache[this.leftPos];
        if (this.rightBuffer.length > 0 && !this.rightBufferIgnore) {
          // Compare the first value of buffer.
          let compared = this.sorter(this.parentRow,
            leftRow, this.rightBuffer[0]);
          // If buffer's first value is different from left value, 
          // clear the buffer.
          if (compared === 0) {
            this.rightBuffer.forEach(rightRow => {
              let resultRow = this.joinRow(leftRow, rightRow);
              if (this.comparator(resultRow, this.parentRow)) {
                output.push(resultRow);
              }
            });
          } else {
            this.rightBuffer = [];
          }
        }
        if (this.rightBuffer.length === 0 && this.leftJoin) {
          // Handle left join.
          output.push(this.joinRow(leftRow, this.rightFiller));
        }
        this.rightBufferIgnore = false;
        this.leftPos ++;
      }
    } else {
      return { done: true, value: null };
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
    this.leftCache = null;
    this.leftPos = 0;
    this.leftDone = false;
    this.rightCache = null;
    this.rightPos = 0;
    this.rightDone = false;
    this.rightBuffer = [];
    this.rightBufferIgnore = false;
  }
  [Symbol.asyncIterator]() {
    return this;
  }
}
