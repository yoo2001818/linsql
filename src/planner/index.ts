import { TableRef, Expression } from 'yasqlp';

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
  // 3. Calculating optimal path for joining.

  // Of course, in order to establish graph, we have to search inside WHERE AST
  // to find what's available.
  // Nevertheless, we can still plan for each table's entry, and retrieve
  // the connected graph for them.
  
  // For the sake of simplicity, it'd be best to execute table's own WHERE here
  // if possible.

  // If OR is specified, it'd be a good idea to split the query and calculate
  // the cost for UNIONing both queries.
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

}

export function findTableSargs(table: string, where: Expression): Expression {
  // This should find sargable expressions for the given table.
  // OR must not be used in here, as it can't be used for table lookup anyway,
  // and optimizer can run UNION on it later.
  // However, OR for only single column is okay.
  let output: Expression[] = [];
  // We'll only traverse directly SARGable entries, and logical operators.
  function traverseStep(expr: Expression) {
    switch (expr.type) {
      case 'logical':
        if (expr.op === '&&') {
          expr.values.map(child => traverseStep(child));
        }
        break;
      case 'binary':
        if (expr.left.type === 'column') {

        }
        break;
      case 'custom':
        if (expr.customType === 'andGraph') {
          // TODO
        }
    }
  }
  return output;
}
