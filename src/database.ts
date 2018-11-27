import { Table } from './table';

export class Database {
  tables: Table[];
  async getTable(name: string): Promise<Table> {
    return null;
  }
}
