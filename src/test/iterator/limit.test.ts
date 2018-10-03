import parse, { OrderByRef } from 'yasqlp';

import InputIterator from '../../iterator/input';
import LimitIterator from '../../iterator/limit';

import drainIterator from '../../util/drainIterator';
import { getOrderBy } from '../../util/select';

describe('LimitIterator', () => {
  let iterInput: InputIterator;
  let iter: LimitIterator;
  beforeEach(() => {
    iterInput = new InputIterator('a',
      Array.from({ length: 1000 }, (_, i) => ({ id: i })), ['id']);
  });
  it('should limit start', async () => {
    iter = new LimitIterator(iterInput, 1, 499);
    expect(await drainIterator(iter)).toEqual([{ a: { id: 499 } }]);
  });
  it('should return schema', async () => {
    expect(await iter.getColumns()).toEqual({ a: ['id'] });
  });
  it('should be rewindable', async () => {
    iter = new LimitIterator(iterInput, 2, 495);
    await drainIterator(iter);
    iter.rewind();
    expect(await drainIterator(iter)).toEqual([
      { a: { id: 495 } }, { a: { id: 496 } },
    ]);
  });
  it('should return order if specified', async () => {
    expect(iter.getOrder()).toEqual(getOrderBy('SELECT 1 ORDER BY a.id;'));
  });
});
