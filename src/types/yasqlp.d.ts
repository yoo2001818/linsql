declare module 'yasqlp' {
  export type NullValue = { type: 'null' };
  export type DefaultValue = { type: 'default' };
  export type ColumnValue = {
    type: 'column',
    table?: null | string,
    name: string,
  };
  export type WildcardValue = {
    type: 'wildcard',
    table?: null | string,
  };
  export type BooleanValue = { type: 'boolean', value: boolean };
  export type NumberValue = { type: 'number', value: number };
  export type StringValue = { type: 'string', value: string };
  export type CaseExpression = {
    type: 'case',
    value?: null | Expression,
    matches: { query: Expression, value: Expression }[],
    else?: null | Expression,
  };
  export type FunctionExpression = {
    type: 'function',
    name: string,
    args: Expression[],
  };
  export type AggregateExpression = {
    type: 'aggregation',
    name: string,
    qualifier: null | 'distinct' | 'all',
    value: Expression,
  };
  export type PrimaryExpression = ColumnValue | WildcardValue | BooleanValue |
    NumberValue | StringValue | CaseExpression | FunctionExpression |
    AggregateExpression | NullValue | DefaultValue;
  export type BinaryExpression = {
    type: 'binary',
    op: '<<' | '>>' | '+' | '-' | '*' | '/' | '%' | '^',
    left: Expression,
    right: Expression,
  };
  export type InExpression = {
    type: 'in',
    target: Expression,
    values: { type: 'list', values: Expression[] } | SelectStatement,
  };
  export type BetweenExpression = {
    type: 'between',
    target: Expression,
    min: Expression,
    max: Expression,
  };
  export type CompareExpression = {
    type: 'compare',
    op: '!=' | '=' | '>=' | '>' | '<=' | '<' | 'is' | 'like',
    left: Expression,
    right: Expression,
  };
  export type UnaryExpression = {
    type: 'unary',
    op: '!' | '-' | '~',
    value: Expression,
  };
  export type LogicalExpression = {
    type: 'logical',
    op: '||' | '&&',
    values: Expression[],
  };
  export type ExistsExpression = {
    type: 'exists',
    value: SelectStatement,
  };
  export type Expression = PrimaryExpression | BinaryExpression | InExpression |
    BetweenExpression | CompareExpression | UnaryExpression |
    LogicalExpression | ExistsExpression;
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
  export type SelectBasicStatement = SelectCoreStatement & {
    order: null | OrderByRef[],
    limit: null | { limit: null | number, offset: null | number },
    unions?: null | SelectUnionStatement[],
  };
  export type SelectStatement = SelectBasicStatement | SelectUnionStatement;
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
  export type Statement = InsertStatement | UpdateStatement | DeleteStatement |
    SelectStatement;
  export default function parse(input: string): Statement[];
}
