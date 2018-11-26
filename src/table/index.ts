export interface Index {
  name: string,
  order: [string, boolean][],
  unique: boolean,
  cardinality: number,
  count: number,
}

export interface BaseTable {
  name: string,
  columns: string[],
}

export interface NormalTable extends BaseTable {
  indexes: Index[],
  order: [string, boolean][],
  count: number,
  fetch: (indexName?: string, low?: any[], high?: any[],
    lte?: boolean, gte?: boolean) => Iterator<Promise<any[]>>,
}

export interface ArrayTable extends BaseTable {
  order: [string, boolean][],
  count: number,
  fetch: (low?: any[], high?: any[]) => Iterator<Promise<any[]>>,
}
