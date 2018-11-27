import { SelectStatement } from 'yasqlp';

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

export interface FileTable extends BaseTable {
  order: [string, boolean][],
  count: number,
  distKeys: string[],
  fetch: (distLow?: any[], distHigh?: any[], low?: any[], high?: any[]) =>
    Iterator<Promise<any[]>>,
}

export interface RemoteSQLTable extends BaseTable {
  count: number,
  fetch: (sql: SelectStatement) => Iterator<Promise<any[]>>,
}

export interface RemoteRESTTable extends BaseTable {
  endpoint: string,
  pkName: string,
  searchableColumns: string[],
  detailColumns: string[],
  fetch: (low?: any, high?: any, lte?: boolean, gte?: boolean) =>
    Iterator<Promise<any[]>>,
  fetchDetail: (low?: any, high?: any, lte?: boolean, gte?: boolean) => 
    Iterator<Promise<any[]>>,
}

export type Table = NormalTable | ArrayTable | FileTable;
