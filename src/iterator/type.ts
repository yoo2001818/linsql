import { Row } from '../row';

export default interface RowIterator extends AsyncIterableIterator<Row[]> {
  getColumns(): Promise<string[]>;
}
