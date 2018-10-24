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
  value: DependencySelectStatement[],
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
 * Rewrites select statement to move subquerys and aggregations to top level,
 * and rewrites expression to use virtual values instead of them.
 * @param stmt 
 */
export default function extractDependency(
  stmt: SelectStatement,
): DependencySelectStatement {
  rewrite(stmt, {}, (expr, state) => {
    return { expr, state };
  });
}
