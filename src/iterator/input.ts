import { Row } from '../row';

export default async function * inputIterator(
  input: Row[],
): AsyncIterator<Row[]> {
  yield input;
}
