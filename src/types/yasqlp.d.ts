declare module 'yasqlp' {
  export type Expression = any;
  export type SelectColumn = {
    qualifier?: null | 'distinct' | 'all',
    name?: null | string,
    value: Expression,
  };
  export type TableRef = {
    type: 'table',
    name: string,
    schema?: null | string,
  };
  export type SelectTable = {
    table: { name?: null | string, value: TableRef | SelectStatement },
  } & ({
    type: 'normal',
  } | {
    type: 'cross' | 'inner' | 'left' | 'right',
    where?: null | Expression,
    natural?: boolean,
  });
  export type OrderByRef = {
    value: Expression,
    direction?: null | 'asc' | 'desc',
  };
  export type SelectCoreStatement = {
    type: 'select',
    columns: SelectColumn[],
    from: null | SelectTable[],
    where: null | Expression,
    groupBy: null | Expression[],
    having: null | Expression,
  };
  export type SelectUnionStatement = SelectCoreStatement & {
    unionType: 'union' | 'unionAll' | 'intersect' | 'except',
  };
  export type SelectStatement = SelectCoreStatement & {
    order: null | OrderByRef[],
    limit: null | { limit: null | number, offset: null | number },
    unions?: null | SelectUnionStatement[],
  };
  export type InsertValues = {
    type: 'values',
    values: Expression[][],
  };
  export type InsertDefaultValues = {
    type: 'default',
  };
  export type InsertStatement = {
    type: 'insert',
    table: TableRef,
    columns: string[],
    values: InsertValues | InsertDefaultValues | SelectStatement,
  };
  export type DeleteStatement = {
    type: 'delete',
    table: TableRef,
    where: null | Expression,
    order: null | OrderByRef[],
    limit: null | { limit: null | number, offset: null | number },
  };
  export type UpdateStatement = {
    type: 'update',
    table: TableRef,
    values: null | { key: string, value: Expression }[],
    order: null | OrderByRef[],
    limit: null | { limit: null | number, offset: null | number },
  };
  export type Statement = any;
  export default function parse(input: string): Statement[];
}
