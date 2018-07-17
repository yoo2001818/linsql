import { Expression } from 'yasqlp';
import { Row } from '../../row';
import RowIterator from '../type';
import compileExpression from '../../util/compileExpression';
import drainIterator from '../../util/drainIterator';

export default class HashJoinIterator implements RowIterator {
  left: RowIterator;
  right: RowIterator;
  leftJoin: boolean;
  constructor(left: RowIterator, right: RowIterator, where: Expression,
    leftJoin: boolean = false,
  ) {
    this.left = left;
    this.right = right;
    this.leftJoin = leftJoin;
    // We need to extract hash information from the where clause.
    // Only =, in, AND, OR is allowed in here.
    // We separate each row into 'bucket', 'tuple', 'corresponding value'
    // [a, b] -> [c, d] means (a, b) should match against (c, d)
    // Case 1) a = b: [a] -> [b] 
    // Case 2) a = b OR c = d: [a] -> [b] OR [c] -> [d]
    // Case 3) a = b AND c = d: [a, c] -> [b, d]
    // Case 4) a = b AND c = b: [a] -> [b], additional c = b check
    // Case 5) a = b AND a = d: [a] -> [b] AND [a] -> [d]
    // Case 6) a = b OR a = d: [a] -> [b] OR [a] -> [d]
    // Case 7) a = b OR a = d: [a] -> [b | d]
  }
}
