import { Expression, SelectStatement } from 'yasqlp';

type Aggregation = {
  name: number,
  method: string,
  distinct: boolean,
  expression: Expression,
};

type DependencySelectStatement = SelectStatement & {
  aggregations: Aggregation[],
  subquerys: any[],
};

/**
 * Rewrites select statement to move subquerys and aggregations to top level,
 * and rewrites expression to use virtual values instead of them.
 * @param stmt 
 */
export default function extractDependency(
  stmt: SelectStatement,
): DependencySelectStatement {
  
}
