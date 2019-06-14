import { Expression, OrderByRef } from 'yasqlp';
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
  rangeSetDescriptor,
} from './getSargsRange';

interface IndexLookup {
  index: Index,
  depth: number,
  ranges: RangeSet<IndexValue>,
  cost: number,
}

function getIndexCandidates(
  node: SargScanNode,
  indexMap: IndexMap,
  table: NormalTable,
  orderHint?: OrderByRef[],
): IndexLookup[] {
  // This should return the possible index lookups for given sarg lookup.
  // a -> b -> c -> d
  let output: IndexLookup[] = [];
  let orderHintIndex: number = 0;
  for (let key in node) {
    if (indexMap[key] == null) continue;
    let indexes = indexMap[key];
    for (let index of indexes) {
      // For each index, descend if possible to do so.
      let values = null;
      let depth = 0;
      let fulfilled = true;
      let hasRange = false;
      for (let i = 0; i < index.order.length; i += 1) {
        let order = index.order[i];
        let entry = node[order.key];
        // If order hint was specified, and hasRange is not true therefore
        // order by can be fulfilled, we can pull orderHints where possible.
        let orderHintValue = orderHint != null && orderHint[orderHintIndex];
        if (entry == null) {
          if (orderHintValue && !hasRange) {
            let entry = orderHintValue.value;
            if (entry.type === 'column' && entry.name === order.key) {
              // We can use this! append to the results...
              depth += 1;
              orderHintIndex += 1;
              values = values.map(value => ({
                min: [
                  ...value.min,
                  value.minEqual ? negativeInfinity : positiveInfinity,
                ],
                max: [
                  ...value.max,
                  value.maxEqual ? positiveInfinity : negativeInfinity,
                ],
                minEqual: value.minEqual,
                maxEqual: value.maxEqual,
              }));
            }
          }
          break;
        }
        if (orderHintValue && !hasRange) {
          let entry = orderHintValue.value;
          if (entry.type === 'column' && entry.name === order.key) {
            orderHintIndex += 1;
          }
        }
        depth += 1;
        // Try to populate values..
        if (values == null) {
          values = entry;
          if (!hasRange) {
            hasRange = values.some(v =>
              rangeSetDescriptor.compare(v.min, v.max) !== 0);
          }
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
              output.push({
                min: [
                  ...value.min,
                  value.minEqual ? negativeInfinity : positiveInfinity,
                ],
                max: [
                  ...value.max,
                  value.maxEqual ? positiveInfinity : negativeInfinity,
                ],
                minEqual: value.minEqual,
                maxEqual: value.maxEqual,
              });
              continue;
            }
            if (!hasRange) {
              hasRange = entry.some(v =>
                rangeSetDescriptor.compare(v.min, v.max) !== 0);
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
      // In order to calculate approximated cost, we can use table histogram if
      // available. Since linsql supports neither table histogram and index
      // diving, let's just simply approximate the value.
      //
      // If the index is purely composed of '=' queries, we can use them to
      // calculate exact cardinality and cost. However, it's best to rely on
      // the histogram data. It's not available for now - so let's just
      // table's cardinality?
      // 
      // For the sake of simplicity, let's use min / max value for index diving.
      let minValue = values[0];
      let maxValue = values[values.length - 1];
      let cost = table.getStatistics(index.name,
        minValue.min, maxValue.max, minValue.minEqual, maxValue.maxEqual).count;
      output.push({
        index,
        depth,
        ranges: values,
        cost,
      });
    }
  }
  return output;
}

function pickIndexCandidate(
  sarg: SargScanNode,
  indexMap: IndexMap,
  table: NormalTable,
  orderHint?: OrderByRef[],
): IndexLookup {
  let candidates = getIndexCandidates(sarg, indexMap, table, orderHint);
  // Try to pick the best index. 
  let minCost = Infinity;
  let minIndex = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    let candidate = candidates[i];
    let cost = candidate.cost;
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
  orderHint?: OrderByRef[],
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
    .map(sarg => pickIndexCandidate(
      sarg as SargScanNode, indexMap, table, orderHint));
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
        jNode.index.order.slice(0, jNode.depth).every(
          (v, i) => iNode.index.order[i].key === v.key)
      ) {
        // It can be absorbed - merge the node, while attaching '-Infinity' and
        // 'Infinity' to smaller node.
        let appendagesPositive: IndexValue = [];
        let appendagesNegative: IndexValue = [];
        for (let v = jNode.depth; v < iNode.depth; v += 1) {
          appendagesPositive.push(positiveInfinity);
          appendagesNegative.push(negativeInfinity);
        }

        let newNode = {
          ...iNode,
          ranges: rangeSet.or(
            iNode.ranges,
            jNode.ranges.map((range) => ({
              ...range,
              min: [
                ...range.min,
                ...(range.minEqual ? appendagesNegative : appendagesPositive),
              ],
              max: [
                ...range.max,
                ...(range.maxEqual ? appendagesPositive : appendagesNegative),
              ],
            })),
          ),
        };
        lookups[i] = newNode;
        lookups.splice(j, 1);
        i = 0;
        j = 0;
      }
    }
  }
  console.dir(lookups, { depth: null });
}
