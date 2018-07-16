import { Row } from '../row';

export default interface RowIterator extends AsyncIterableIterator<Row[]> {
  getColumns(): Promise<{ [key: string]: string[] }>;
  getOrder(): string[][] | null;
  // Rewinds the iterator to first position to support subqueries.
  rewind(parentRow?: Row): void;
}
