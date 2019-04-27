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
// We need to note that range queries can only be done at the rightmost
// position, this is absolutely important.
// Other than non-range queries, we can consider them as a group, since
// their order shouldn't matter before picking an index.
//
// For example, (a = 1 AND b = 1 AND c = 1) AND d > 5
// d > 5 should be rightmost one, but others are not.
//
// (a = 1 OR b = 1 OR c = 1) is resolved using index merge, but this is out
// of scope for now.
//
// For this reason, ranges and non-ranges can be separated.
// However, this is not enough - we have to resolve
// a > 3 OR (a = 3 AND b > 5).
//
// This can be implemented by putting expression inside equal predicate.
// Then it can be freely converted into ranges, no matter how the indices are
// constructed.
// 
// Therefore, we'll construct a tree-like structure using this. This is very
// similiar to the original AST, but has more information about its children.
//
// a > 3 OR (a = 3 AND b > 5)
// OR -- a -- a > 3
//    \     \ AND -- a = 3 (master)
//    |     /       \ b > 5 (child)
//    \- b /
//
// (a = 1 AND b = 1 AND c = 1) OR a > 3
// OR -- a -- a > 3
//    |     + AND -- a = 1
//    |- b -|      | b = 1
//    |- c -|      | c = 1

interface RangeAndNode {
  type: 'and',
  columns: { [column: string]: RangeNode[] },
}

interface RangeOrNode {
  type: 'or',
  columns: { [column: string]: RangeNode[] },
}

interface RangeCompareNode {
  type: 'binary',
  column: string,
  value: Expression,
}

type RangeNode = RangeAndNode | RangeOrNode | RangeCompareNode;
  
export default function findSargsRange(
  name: string, table: NormalTable, where: Expression,
) {
  const sets: RangeResult[] = [];
  function traverseStep(expr: Expression): RangeNode {
    switch (expr.type) {
      case 'logical':
        if (expr.op === '&&') {
          expr.values.forEach(child => traverseStep(index, child));
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
