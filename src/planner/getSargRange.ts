import { Expression } from 'yasqlp';

// Extracts SARG range from the given expression - so the scan operator can
// pull out the required range.
// (a.b > 3 AND a.b >= 5) should be extracted into...
// b: ['>= 5']
// Note that this completely ignores '!=', as it's not optimizable for index
// scans and it greatly increase the complexity of the logic.
// a.b > 3 AND a.b != 6 is still a.b > 3 because of this.
type SargRangeOp = {
  op: '>' | '<' | '>=' | '<=' | '=',
  value: any,
};

type SargRangeEntry = {
  keys: string[],
  values: SargRangeOp[],
};

export default function getSargRange(table: string, expr: Expression) {
  const output: SargRangeEntry[] = [];
  const valueMap: { [key: string]: SargRangeEntry } = {};
  return output;
}

const RANGE_TABLE = {
  '<': { enter: true, exit: false },
  '>': { enter: false, exit: true },
  '<=': { enter: true, exit: false },
  '>=': { enter: false, exit: true },
  '=': { enter: false, exit: false },
};

function sargCompare (a: SargRangeOp, b: SargRangeOp) {
  if (a.value > b.value) return 1;
  else if (a.value < b.value) return -1;
  else return 0;
}

function sargAnd (a: SargRangeOp[], b: SargRangeOp[]): SargRangeOp[] {
  if (a.length === 0) return [];
  if (b.length === 0) return [];
  let aIndex = 0;
  let bIndex = 0;
  let aInside = RANGE_TABLE[a[0].op].enter;
  let bInside = RANGE_TABLE[a[0].op].enter;
  let output = [];
  while (aIndex < a.length && bIndex < b.length) {
    let aOp = a[aIndex];
    let bOp = b[bIndex];
    // Compare both values and advance smaller one.
    let compared = sargCompare(aOp, bOp);
    if (compared < 0) {
      let { exit } = RANGE_TABLE[aOp.op];
      aInside = exit;
      if (bInside) output.push(aOp);
      aIndex += 1;
    } else if (compared > 0) {
      let { exit } = RANGE_TABLE[bOp.op];
      bInside = exit;
      if (aInside) output.push(bOp);
      bIndex += 1;
    } else {
      // Both have same value - this is a special case.
      //     <  > <= >=  =
      //  <  <  X  <  X  X
      //  >  X  >  X  >  X
      // <=  <  X <=  =  =
      // >=  X  >  = >=  =
      //  =  X  X  =  =  =
    }
  }
  // Digest remaining data.
  while (aCount < a.length) {
    let op = a[aCount];
    let { exit } = RANGE_TABLE[op.type];
    aInside = exit;
    if (bInside) {
      output.push(op);
    }
    aCount += 1;
  }
  while (bCount < b.length) {
    let op = b[bCount];
    let { exit } = RANGE_TABLE[op.type];
    bInside = exit;
    if (aInside) {
      output.push(op);
    }
    bCount += 1;
  }
  return output;
}

function sargOr (a: SargRangeOp[], b: SargRangeOp[]): SargRangeOp[] {

}
