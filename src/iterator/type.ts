import { OrderByRef } from 'yasqlp';
import { Row } from '../row';

export default interface RowIterator extends AsyncIterableIterator<Row[]> {
  getTables(): string[];
  getColumns(): Promise<{ [key: string]: string[] }>;
  getOrder(): OrderByRef[] | null;
  // Rewinds the iterator to first position to support subqueries.
  rewind(parentRow?: Row): void;
}
