import { Row } from '../row';

const createJoinRow = (
  leftTables: string[], rightTables: string[],
) => (left: Row, right: Row) => {
  let output: Row = {};
  leftTables.forEach(v => output[v] = left[v]);
  rightTables.forEach(v => output[v] = right[v]);
  return output;
};

export default createJoinRow;
