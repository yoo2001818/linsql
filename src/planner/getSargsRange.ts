import { Expression } from 'yasqlp';
import createRangeSetModule, { RangeSet } from 'range-set';

import { NormalTable, Index } from '../table';

const numberDescriptor = {
  compare: (a: number, b: number) => a - b,
  isPositiveInfinity: (v: number) => v === Infinity,
  isNegativeInfinity: (v: number) => v === -Infinity,
  positiveInfinity: Infinity,
  negativeInfinity: -Infinity,
};

const stringPositiveInfinity = Symbol('+Infinity');
const stringNegativeInfinity = Symbol('-Infinity');

const stringDescriptor = {
  compare: (a: string, b: string) => {
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  },
  isPositiveInfinity: (v: any) => v === stringPositiveInfinity,
  isNegativeInfinity: (v: any) => v === stringNegativeInfinity,
  positiveInfinity: stringPositiveInfinity,
  negativeInfinity: stringNegativeInfinity,
};

interface RangeResult {
  name: string,
  set: RangeSet<any>,
}

export default function findSargsRange(
  name: string, table: NormalTable, where: Expression,
) {
  const sets: RangeResult[] = [];

  // We have to handle more than one columns, to be exact, N 'equal' columns
  // and one range columns.
  //
  // Right columns can't be used until left columns are specified using '=',
  // and only rightmost column can use range queries like '>', '<'.
  // Note that we don't have to use all the columns - we still can use
  // range queries when the columns are not used completely.
  //
  // However, there is one exception - a expression can be converted to one
  // range scan.
  // a > 3 OR (a = 3 AND b > 5)
  // a >= 3 AND (a > 3 OR b > 5)
  // ...both can be converted into ((3, 5) ... inf), for (a, b) index.
  // 
  // First one is pretty straightforward - since both ranges are inside (a, b)
  // index's range, they just have to merged together.
  // Second one can be a little tricky to derive the ranges. a >= 3 is easy
  // to derive, however, (a > 3 OR b > 5) requires the prior knowledge of
  // a >= 3. 
  // 
  // Since second one is too hard to process, let's just process the first one.
  //
  // Expressions merged using 'AND' is simple to process - we can just ignore
  // irrelevant columns. Of course, all columns must be present, but still it's
  // simple enough.
  // On the other hand, 'OR' requires all predicates are relevant to the index.
  //
  // To extract ranges from expressions, we have to fully traverse the AST.
  // We'll need to traverse them at least twice - one to extract its
  // dependencies, and one to extract range.
  //
  // - Current index.
  // - Parent range set.
  // - An output range set.
  // - A lookahead (or rather, lookbefore) buffer.
  // - An array specifying if we've met the column of the array's index.
  // - Leftover set
  //
  // AND encounter
  // 1. Extract list of columns from each expression.
  //    - If its dependency is not met yet, put it in lookahead buffer, along
  //      with needed column list.
  //      TODO Take care of OR clause 
  //    - If it's met, run it again to extract range set.
  // 2. After traversing everything, if lookahead buffer is present, and its
  //    dependencies are met, try to run them again.
  // 3. Return the fulfilled column list and parent range set.
  //
  // OR encounter
  // 1. Pass the parent range set to expressions, and retrieve range set from
  //    each expression. While doing that, extract list of columns.
  // 2. Return the list of columns, and if it exists, return the range set.

  function traverseStep(expr: Expression) {
    switch (expr.type) {
      case 'logical':
        if (expr.op === '&&') {
          expr.values.forEach(child => traverseStep(child));
        } else if (expr.op === '||') {
          // Run two indices and check if they're mergeable - 
        }
        break;
      case 'binary':
        /*
        if (expr.left.type === 'column' && expr.left.table === name) {
          if (expr.right.type === 'number') {
            columns[expr.left.name] = numberSet.and(
              columns[expr.left.name] || [],
              numberSet.gt(expr.right.value),
            );
          }
        }
        if (expr.right.type === 'column' && expr.right.table === name) {
          if (expr.left.type === 'number') {
            columns[expr.right.name] = numberSet.and(
              columns[expr.right.name] || [],
              numberSet.gt(expr.left.value),
            );
          }
        }
        */
        break;
    }
  }
  traverseStep(where);
}
