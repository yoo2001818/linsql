import parse, { Expression, OrderByRef, SelectColumn, SelectBasicStatement }
  from 'yasqlp';

export function getWhere(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.where;
  throw new Error('Given statement is not select statement');
}

export function getColumn(code: string): Expression {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.columns[0].value;
  throw new Error('Given statement is not select statement');
}

export function getColumns(code: string): SelectColumn[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select') return stmt.columns;
  throw new Error('Given statement is not select statement');
}

export function getOrderBy(code: string): OrderByRef[] {
  let stmt = parse(code)[0];
  if (stmt.type === 'select' && 'order' in stmt) return stmt.order;
  throw new Error('Given statement is not select statement');
}

export function getSelect(code: string): SelectBasicStatement {
  let stmt = parse(code)[0];
  if (stmt.type === 'select' && 'order' in stmt) return stmt;
  throw new Error('Given statement is not select statement');
}
