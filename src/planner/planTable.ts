import { Expression } from 'yasqlp';
import { RangeSet } from 'range-set';

import { NormalTable, Index } from '../table';
import { SelectPlan } from './type';
import getIndexMap, { IndexMap } from './getIndexMap';
import getSargsRange, { SargScanNode, IndexValue } from './getSargsRange';

interface IndexLookup {
  index: Index,
  depth: number,
  ranges: RangeSet<IndexValue>,
}

function getIndexCandidates(
  node: SargScanNode,
  indexMap: IndexMap,
): IndexLookup[] {
  // This should return the possible index lookups for given sarg lookup.
  // a -> b -> c -> d
  let output: IndexLookup[] = [];
  for (let key in node) {
    if (indexMap[key] == null) continue;
    let indexes = indexMap[key];
    for (let index of indexes) {
      // For each index, descend if possible to do so.
      let depth = 0;
      for (let i = 0; i < index.order.length; i += 1) {
        let order = index.order[i];
        if (node[order.key] == null) break;
        depth += 1;
      }
    }
  }
  return output;
}

export default function planTable(
  name: string,
  table: NormalTable,
  where: Expression,
): SelectPlan | null {
  let indexMap = getIndexMap(table);
  let sargs = getSargsRange(name, indexMap, where);
  if (sargs.length === 0) {
    // This always returns nothing.
    return null;
  }
  // Check whether if we can merge index lookups into one.
}
