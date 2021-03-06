import { TableRef, Expression, SelectBasicStatement } from 'yasqlp';

import { DependencySelectStatement } from './extractDependency';
import { SelectPlan } from './type';
import { NormalTable } from '../table';
import optimize from '../expression/optimize';
import Database from '../database';
import planTable from './planTable';

export default function plan(
  database: Database, stmt: DependencySelectStatement,
): SelectPlan {
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

  let tables = stmt.from.map((from, i) => {
    let table = from.table;
    if (from.table.name == null && table.value.type !== 'table') {
      throw new Error('Subquery must have defined name');
    }
    let tableExpr = whereExpr;
    if (from.type === 'left' || from.type === 'right') {
      // TODO Optimize... optimizer.
      tableExpr = optimize({
        type: 'logical',
        op: '&&',
        values: [whereExpr, from.where],
      });
    }
    if (table.value.type === 'select') {
      // TODO We should think about sending sargs data into subquery
      return plan(database, table.value);
    } else {
      const order = 'order' in stmt ? stmt.order : [];
      return planTable(table.name,
        // TODO Support more than NormalTable
        table as any as NormalTable,
        tableExpr,
        order);
    }
  });

  // 2. Calculate join path. This can be O(n^2), or we can just use known
  // join path specified in AND graph.

  if (stmt.from.length > 0) {
    let first = stmt.from.find(from => from.type === 'normal');
    if (first.table.value.type === 'table') {
      current = {
        type: 'fullScan', 
        table: first.table.value,
        name: first.table.name || first.table.value.name,
        cost: 0,
        totalCost: 0,
        rows: 0,
      };
    } else {
      current = plan(database, first.table.value);
    }
  } else {
    current = { type: 'constant', cost: 0, totalCost: 0, rows: 1 };
  }

  // 3. Attach table-wise where.
  if (stmt.where != null) {
    current = {
      type: 'filter',
      value: stmt.where,
      input: current,
      cost: 0,
      totalCost: 0,
      rows: 0,
    };
  }

  if ('order' in stmt) {
    // Attach order by.
    current = {
      type: 'sort',
      order: stmt.order,
      input: current,
      cost: 0,
      totalCost: 0,
      rows: 0,
    };
  }
  // 5. Running order by (pre)
  // 6. Running aggregations
  // 7. Running having
  // 8. Running order by (post)
  return current;
}
