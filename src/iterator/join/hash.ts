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
  plan: HashJoinPlan;
  tables: any[][];
  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean = false,
  ) {
    this.left = left;
    this.right = right;
    this.leftJoin = leftJoin;
    this.plan = planHashJoin(where, [], []);
  }
  async next(): Promise<IteratorResult<Row[]>> {
    if (this.tables == null) {
      // TODO fetch values
    }
  }
}
