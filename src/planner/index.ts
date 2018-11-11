import { DependencySelectStatement } from './extractDependency';
import { SelectPlan } from './type';

export default function plan(stmt: DependencySelectStatement): SelectPlan {
  // From here, we generate graph from fetching the table to running unions.
  // 1. Fetching tables (This includes subquery.)
  let current: SelectPlan;
  // We have to generate all the joins inside here; This is absurdly
  // complicated problem, it's actually O(n!) to traverse all the choices.

  // Also, in order to generate cost information for planning, we have to
  // fetch histogram / cardinality data too.

  // We'll simplify this problem by doing:
  // 1. Calculating costs for fetching each table initially.
  // 2. Calculating costs for joining, n to n.
  if (stmt.from.length > 0) {
    let first = stmt.from.find(from => from.type === 'normal');
    if (first.table.value.type === 'table') {
      current = {
        type: 'fullScan', 
        table: first.table.value,
        name: first.table.name || first.table.value.name,
        cost: 0,
        totalCost: 0,
      };
    } else {
      current = plan(first.table.value);
    }
  } else {
    current = { type: 'constant' };
  }
  if (stmt.where != null) {
    current = {
      type: 'filter',
      value: stmt.where,
      input: current,
      cost: 0,
      totalCost: 0,
    };
  }
  // 5. Running order by (pre)
  // 6. Running aggregations
  // 7. Running having
  // 8. Running order by (post)
  return current;
}

export function planFetch(): SelectPlan {

}

export function planJoin(): SelectPlan {

}
