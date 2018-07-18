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
    // Case 1) a.1 = b.1: [a.1] -> [b.1]
    // Case 2) a.1 = b.1 AND a.2 = b.2: [a.1, a.2] -> [b.1, b.2]
    // Case 3) a.1 = b.1 AND a.2 = b.1: [a.1] -> [b.1] AND a.1 = a.2 prefilter
    // Case 4) a.1 = b.1 AND a.1 = b.2: [a.1] -> [b.1] AND b.1 = b.2 prefilter
    // Case 5) a.1 = b.1 OR a.2 = b.2: [a.1] -> [b.1] OR [a.2] -> [b.2]
    // Case 6) a.1 = b.1 OR a.2 = b.1: [a.1 | a.2] -> [b.1]
    // Case 7) a.1 = b.1 OR a.1 = b.2: [a.1] -> [b.1 | b.2]
    // Case 8) (...) AND a.3 = b.3: [a.3] -> [b.3] AND after filter
    // Case 9) (a.1 = b.1 AND a.2 = b.2) OR a.3 = b.3:
    //   [a.1, a.2] -> [b.1, b.2] OR [a.3] -> [b.3]
    // Basically, we can perform multiple hash joins lookups for OR, but
    // for AND this is a really bad idea.
    // Extract hashtables and clauses like this:
    // $0: [b.1], $0: [b.2]
    // Test a.1 = a.2
    // Fetch a.1 -> $0
  }
}
