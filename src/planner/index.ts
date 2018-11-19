import { TableRef } from 'yasqlp';

import { DependencySelectStatement } from './extractDependency';
import { SelectPlan } from './type';
import findTableSargs from './findTableSargs';

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
  // 3. Calculating optimal path for joining.

  // Of course, in order to establish graph, we have to search inside WHERE AST
  // to find what's available.
  // Nevertheless, we can still plan for each table's entry, and retrieve
  // the connected graph for them.
  
  // For the sake of simplicity, it'd be best to execute table's own WHERE here
  // if possible.

  // If OR is specified, it'd be a good idea to split the query and calculate
  // the cost for UNIONing both queries.

  // 1. Extract the SARGs. To do that, we 'fudge' WHERE and ON clauses into
  //    single expression. This is valid for inner joins, but for other joins,
  //    this is not valid and requires special processing.
  // 
  // For example, SELECT * FROM a LEFT JOIN b ON a.id = b.id, performs left
  // join, which means if there are no corresponding entry on B for A, a null
  // is joined instead. This greatly limits the optimization - we are unable to
  // join from B's side.
  // While that is true, however, we can use a.id = b.id while joining -
  // this also means that A or B can be fetched using that index.
  // One problem is that, a LEFT JOIN b ON a.id = b.id WHERE b.id IS NULL,
  // becomes unfetchable if everything is merged to one. There are many
  // broken invariants when merging besides this, so it'll be better to
  // separate ON and WHERE. (But, we just have to be careful about NULL
  // handling)
  let joinExprs = stmt.from.map(from => {
    if ('where' in from) {
      return from.where;
    }
    return null;
  }).filter(v => v != null);

  let sargs = stmt.from.map(from => {
    let name = from.table.name;
    if (name == null) {
      if (from.table.value.type === 'table') {
        name = from.table.value.name;
      } else {
        throw new Error('Subquery must have defined name');
      }
    }
    return findTableSargs(name, {
      type: 'logical',
      op: '&&',
      values: [...joinExprs, stmt.where],
    });
  });
  let tables = stmt.from.map(from => {
    let table = from.table;
    if (table.value.type === 'select') {
      return plan(table.value);
    } else {
      return planFetch(table.value, table.name);
    }
  });

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

export function planFetch(table: TableRef, name?: string): SelectPlan {
  return {
    type: 'fullScan',
    table: table,
    name: name || table.name, 
    cost: 0,
    totalCost: 0,
  }
}

export function planJoin(): SelectPlan {
  return null;
}
