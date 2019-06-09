import { Expression } from 'yasqlp';
import { RangeSet } from 'range-set';

import { NormalTable, Index } from '../table';
import { SelectPlan } from './type';
import getIndexMap, { IndexMap } from './getIndexMap';
import getSargsRange, {
  SargScanNode,
  IndexValue,
  positiveInfinity,
  negativeInfinity,
  rangeSet,
} from './getSargsRange';

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
      let values = null;
      let depth = 0;
      let fulfilled = true;
      for (let i = 0; i < index.order.length; i += 1) {
        let order = index.order[i];
        let entry = node[order.key];
        if (entry == null) break;
        depth += 1;
        // Try to populate values..
        if (values == null) {
          values = entry;
        } else {
          // Should we bail out? bail out if there are too many entries...
          let estimatedSize = values.length * entry.length;
          if (estimatedSize > 1024) {
            depth -= 1;
            break;
          }
          let output: RangeSet<IndexValue> = [];
          for (let i = 0; i < values.length; i += 1) {
            // In order to do this, we expect each value to be 'equal'.
            let value = values[i];
            if (!value.min.every((v, i) => value.max[i] === v)) {
              fulfilled = false;
              output.push(value);
              continue;
            }
            for (let j = 0; j < entry.length; j += 1) {
              let v = entry[j];
              output.push({
                min: [...value.min, ...v.min],
                max: [...value.max, ...v.max],
                minEqual: v.minEqual,
                maxEqual: v.maxEqual,
              });
            }
          }
          values = output;
        }
      }
      output.push({
        index,
        depth,
        ranges: values,
      });
    }
  }
  return output;
}

function pickIndexCandidate(
  sarg: SargScanNode,
  indexMap: IndexMap,
  table: NormalTable,
): IndexLookup {
  let candidates = getIndexCandidates(sarg, indexMap);
  // Try to pick the best index. 
  let minCost = Infinity;
  let minIndex = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    let candidate = candidates[i];
    // In order to calculate the actual cost, we'd have to 'dive' into the
    // index. Unfortunately, that hasn't been implemented yet - so let's just
    // use the index's depth.
    let cost = -candidate.depth;
    if (minCost > cost) {
      minCost = cost;
      minIndex = i;
    }
  }
  return candidates[minIndex];
}

export default function planTable(
  name: string,
  table: NormalTable,
  where: Expression,
): SelectPlan | null {
  let indexMap = getIndexMap(table);
  let sargs = getSargsRange(name, indexMap, where);
  // Sargs can have false-positive, but it can't have false-negative. Therefore,
  // if one of the value is false, it can just return null.
  if (sargs.length > 0 && sargs.some(v => v === false)) return null;
  // Check whether if we can merge index lookups into one. This would be
  // possible if the index is same, or the index can be replaced by index with
  // more depth.
  let lookups = sargs
    .filter(sarg => typeof sarg === 'object')
    .map(sarg => pickIndexCandidate(sarg as SargScanNode, indexMap, table));
  let output = [];
  for (let i = 0; i < lookups.length; i += 1) {
    let iNode = lookups[i];
    // Merge is tricky, because it can happen to any of the node, and if
    // merge happens, it has to iterate over everything again.
    // For now, after merging is done, let's reset the i and j to 0, so it can
    // evaluate the value again.
    // Merge direction: j -> i.
    for (let j = 0; j < lookups.length; j += 1) {
      if (i === j) continue;
      let jNode = lookups[j];
      // Check if the node can be absorbed by other node.
      if (iNode.depth >= jNode.depth &&
        iNode.index.order.slice(0, iNode.depth).every(
          (v, i) => jNode.index.order[i].key === v.key)
      ) {
        // It can be absorbed - merge the node, while attaching '-Infinity' and
        // 'Infinity' to smaller node.
        iNode = {
          ...iNode,
          ranges: rangeSet.and(
            iNode.ranges,
          ),
        };
        i = -1;
        j = -1;
      }
    }
  }
  console.log(lookups);
}
