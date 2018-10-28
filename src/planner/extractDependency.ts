import { Expression, SelectStatement } from 'yasqlp';
import { rewrite } from '../expression/traverse';

type Aggregation = {
  name: string,
  method: string,
  distinct: boolean,
  value: Expression,
};

// EXISTS and IN subqueries cannot be evaluated inside expression directly; we
// need to evaluate it inside 'subquery processor'. Therefore, all contextual
// information needs to be inside here.
// Subquery inside 'FROM' clause are not required to be inside here too.
type Subquery = {
  name: string,
  value: DependencySelectStatement,
} & ({
  type: 'any' | 'all',
  op: '!=' | '=' | '>=' | '>' | '<=' | '<',
  left: Expression,
} | {
  type: 'exists',
} | {
  type: 'scalar',
});

type DependencySelectStatement = SelectStatement & {
  aggregations: Aggregation[],
  subquerys: Subquery[],
};

/**
 * Ensures only one column exists in the select statement
 * @param stmt 
 */
function ensureOneColumn(stmt: SelectStatement) {
  if (stmt.columns.length > 1) {
    throw new Error('Only one column should be in scalar subquery');
  }
  let first = stmt.columns[0].value;
  if (first.type === 'wildcard') {
    throw new Error('No wildcard is allowed in scalar subquery');
  }
}

/**
 * Rewrites select statement to move subquerys and aggregations to top level,
 * and rewrites expression to use virtual values instead of them.
 * @param stmt 
 */
export default function extractDependency(
  stmt: SelectStatement,
): DependencySelectStatement {
  let aggregations: Aggregation[] = [];
  let subquerys: Subquery[] = [];
  let newTable: string = null;
  rewrite(stmt, {}, (expr, state) => {
    switch (expr.type) {
      case 'aggregation': {
        newTable = '_aggr' + aggregations.length.toString();
        aggregations.push({
          name: newTable,
          method: expr.name,
          distinct: expr.qualifier === 'distinct',
          value: expr.value,
        });
        break;
      }
      case 'select':
        // Replace it with constant
        ensureOneColumn(expr);
        newTable = '_subquery' + subquerys.length.toString();
        subquerys.push({
          type: 'scalar',
          name: newTable,
          value: extractDependency(expr),
        });
        break;
      case 'binary': {
        // TODO Implement any / all
        break; 
      }
      case 'exists': {
        ensureOneColumn(expr.value);
        newTable = '_subquery' + subquerys.length.toString();
        subquerys.push({
          type: 'exists',
          name: newTable,
          value: extractDependency(expr.value),
        });
        break;
      }
      case 'in': {
        if (expr.values.type !== 'select') break;
        ensureOneColumn(expr.values);
        newTable = '_subquery' + subquerys.length.toString();
        subquerys.push({
          type: 'any',
          value: extractDependency(expr.values),
          left: expr.target,
          op: '=',
          name: newTable,
        });
        break;
      }
    }
    if (newTable != null) {
      return {
        expr: {
          type: 'column',
          table: newTable,
          name: 'value',
        },
        state,
      }
    }
    return { expr, state };
  });
  return { ...stmt, aggregations, subquerys };
}
