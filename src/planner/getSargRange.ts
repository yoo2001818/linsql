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

  return output;
}
