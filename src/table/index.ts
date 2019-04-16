import { SelectStatement } from 'yasqlp';

export interface Order {
  key: string,
  type: 'string' | 'number',
  order: boolean,
}

export interface Index {
  name: string,
  order: Order[],
  unique: boolean,
  cardinality: number,
  count: number,
}

export interface BaseTable {
  type: string,
  name: string,
  columns: string[],
}

export interface NormalTable extends BaseTable {
  type: 'normal',
  indexes: Index[],
  order: Order[],
  count: number,
  fetch: (indexName?: string, low?: any[], high?: any[],
    lte?: boolean, gte?: boolean) => Iterator<Promise<any[]>>,
}

export interface ArrayTable extends BaseTable {
  type: 'array',
  order: Order[],
  count: number,
  fetch: (low?: any[], high?: any[]) => Iterator<Promise<any[]>>,
}

export interface FileTable extends BaseTable {
  type: 'file',
  order: Order[],
  count: number,
  distKeys: string[],
  fetch: (distLow?: any[], distHigh?: any[], low?: any[], high?: any[]) =>
    Iterator<Promise<any[]>>,
}

export interface RemoteSQLTable extends BaseTable {
  type: 'remoteSql',
  count: number,
  fetch: (sql: SelectStatement) => Iterator<Promise<any[]>>,
}

export interface RemoteRESTTable extends BaseTable {
  type: 'remoteRest',
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
