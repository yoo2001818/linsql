import { TableRef, Expression } from 'yasqlp';

import { DependencySelectStatement } from './extractDependency';
import { SelectPlan } from './type';
import optimize from '../expression/optimize';
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

  // If OR is specified, it'd be a good idea to split the query and calculate
  // the cost for UNIONing both queries.

  // 1. Extract the SARGs.
  // To do that, we 'fudge' WHERE and ON clauses into
  // single expression. This is valid for inner joins, but for other joins,
  // this is not valid and requires special processing. In order to merge
  // them, we have to ensure that the right side / left side is not null.
  // However, if that happens, it also means that it can be converted into
  // regular join. 
  let convertedFrom = stmt.from.map(from => {
    if (from.type === 'left' || from.type === 'right') {
      // TODO Check if WHERE references the row without using IS NULL.
      // If so, it's safe to convert them into regular joins.
    }
    return from;
  });

  let whereExpr = optimize({
    type: 'logical',
    op: '&&',
    values: [
      stmt.where,
      ...stmt.from.map(from => from.type === 'inner' ? from.where : null),
    ].filter(v => v != null),
  });

  let sargs = stmt.from.map(from => {
    let name = from.table.name;
    if (name == null) {
      if (from.table.value.type === 'table') {
        name = from.table.value.name;
      } else {
        throw new Error('Subquery must have defined name');
      }
    }
    let tableWhereExpr = whereExpr;
    if (from.type === 'left' || from.type === 'right') {
      // TODO Optimize... optimizer.
      tableWhereExpr = optimize({
        type: 'logical',
        op: '&&',
        values: [whereExpr, from.where],
      });
    }
    return findTableSargs(name, tableWhereExpr);
  });
  
  let tables = stmt.from.map((from, i) => {
    let table = from.table;
    if (table.value.type === 'select') {
      // TODO We should think about sending sargs data into subquery
      return plan(table.value);
    } else {
      return planFetch(table.value, table.name, sargs[i]);
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

export function planFetch(
  table: TableRef, name?: string, sarg: Expression,
): SelectPlan {
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
