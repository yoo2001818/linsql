import { NormalTable, Index } from '../table';

export type IndexMap = { [key: string]: Index[] };

export default function getIndexMap(table: NormalTable): IndexMap {
  let output: IndexMap = {};
  table.indexes.forEach((index) => {
    index.order.forEach((order) => {
      if (output[order.key] == null) output[order.key] = [];
      output[order.key].push(index);
    });
  });
  return output;
}
