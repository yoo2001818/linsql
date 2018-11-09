import { TableRef, OrderByRef, Expression, SelectColumn } from 'yasqlp';

export type BasePlan = {
  type: string,
  cost: number,
  totalCost: number,
};

export type FullScanPlan = BasePlan & {
  type: 'fullScan',
  table: TableRef,
};

export type FilterPlan = BasePlan & {
  type: 'filter',
  value: Expression,
  input: SelectPlan,
};

export type SortPlan = BasePlan & {
  type: 'sort',
  order: OrderByRef[],
  input: SelectPlan,
}

export type AggregatePlan = BasePlan & {
  type: 'aggregate' | 'aggregateHash',
  groupBy: Expression[],
  aggregates: {
    name: string,
    method: string,
    distinct: boolean,
    value: Expression,
  }[],
  input: SelectPlan,
};

export type LimitPlan = BasePlan & {
  type: 'limit',
  limit: number,
  offset: number,
};

export type OutputPlan = BasePlan & {
  type: 'output',
  values: SelectColumn[],
  name: string,
  input: SelectPlan,
};

export type UniquePlan = BasePlan & {
  type: 'unique' | 'uniqueHash',
  input: OutputPlan,
};

export type UnionPlan = BasePlan & {
  type: 'union' | 'intersect' | 'except',
  ordered: boolean,
  inputs: SelectPlan[],
};

export type NestedJoinPlan = BasePlan & {
  type: 'nestedJoin',
  left: SelectPlan,
  right: SelectPlan,
  rightNull: boolean,
  rightName: string[] | null,
};

export type MergeJoinPlan = BasePlan & {
  type: 'mergeJoin',
  left: SelectPlan,
  right: SelectPlan,
  leftNull: boolean,
  rightNull: boolean,
  leftName: string[] | null,
  rightName: string[] | null,
  leftCriteria: Expression[],
  rightCriteria: Expression[],
};

export type HashGeneratePlan = BasePlan & {
  type: 'hashGenerate',
  criteria: Expression[][],
  input: SelectPlan,
};

export type HashMergePlan = BasePlan & {
  type: 'hashMerge',
  inputs: HashPlan[],
};

export type HashJoinPlan = BasePlan & {
  type: 'hashJoin',
  left: SelectPlan,
  right: HashPlan,
  rightNull: boolean,
  rightName: string[] | null,
  leftCriteria: Expression[][],
};

export type HashPlan = HashGeneratePlan & HashMergePlan;

export type SelectPlan = FullScanPlan & FilterPlan & SortPlan &
  AggregatePlan & LimitPlan & OutputPlan & UniquePlan & UnionPlan &
  NestedJoinPlan & MergeJoinPlan & HashJoinPlan;
