import { Row } from '../row';

const createJoinRow = (
  leftTables: string[], rightTables: string[],
) => {
  const Constructor = function (left: Row, right: Row) {
    for (let i = 0; i < leftTables.length; ++i) {
      let key = leftTables[i];
      this[key] = left[key];
    }
    for (let i = 0; i < rightTables.length; ++i) {
      let key = rightTables[i];
      this[key] = right[key];
    }
  } as any as { new (left: Row, right: Row): Row; };
  return (left: Row, right: Row) => new Constructor(left, right);
};

export default createJoinRow;
