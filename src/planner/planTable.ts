import { Expression } from 'yasqlp';

import { NormalTable } from '../table';
import { SelectPlan } from './type';
import getIndexMap from './getIndexMap';
import getSargsRange from './getSargsRange';

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
