declare module 'yasqlp' {
  export type Expression = any;
  export type InsertValues = {
    type: 'values',
    values: Expression[][],
  };
  export type InsertDefaultValues = {
    type: 'default',
  };
  export type SelectStatement = {
    type: 'select',
    columns: any,
    from: any,
    where: any,
    groupBy: any,
    having: any,
    order: any,
    limit: any,
  } & {
    unions: any[],
  };
  export type InsertStatement = {
    type: 'insert',
    values: InsertValues | InsertDefaultValues | SelectStatement,
  };
  export type DeleteStatement = {
    type: 'delete',
  };
  export type UpdateStatement = {
    type: 'update',
  };
  export type Statement = any;
  export default function parse(input: string): Statement[];
}
