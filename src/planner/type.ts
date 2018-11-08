import { TableRef, OrderByRef, Expression } from 'yasqlp';

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

export type SelectPlan = FullScanPlan & FilterPlan & SortPlan &
  AggregatePlan & LimitPlan;
