import { Table } from './table';

export default class Database {
  tables: { [key: string]: Table } = {};
  addTable(name: string, value: Table) {
    this.tables[name] = value;
  }
  getTable(name: string): Table {
    return this.tables[name];
  }
}
