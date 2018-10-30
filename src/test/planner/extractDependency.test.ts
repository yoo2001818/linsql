import extractDependency from '../../planner/extractDependency';
import { getSelect, getColumn } from '../../util/select';

describe('extractDependency', () => {
  it('should handle subquery cases', () => {
    expect(extractDependency(getSelect('SELECT (SELECT 1);')))
      .toEqual({
        ...getSelect('SELECT _subquery0.value;'),
        subquerys: [{
          name: '_subquery0',
          type: 'scalar',
          value: {
            ...getSelect('SELECT 1;'),
            subquerys: [],
            aggregations: [],
          },
        }],
        aggregations: [],
      });
    expect(extractDependency(
      getSelect('SELECT (SELECT a FROM b WHERE c.id = b.id) FROM c;')))
      .toEqual({
        ...getSelect('SELECT _subquery0.value FROM c;'),
        subquerys: [{
          name: '_subquery0',
          type: 'scalar',
          value: {
            ...getSelect('SELECT a FROM b WHERE c.id = b.id;'),
            subquerys: [],
            aggregations: [],
          },
        }],
        aggregations: [],
      });
  });
  it('should handle nested subquery cases', () => {
    expect(extractDependency(
      getSelect('SELECT (SELECT (SELECT 1));')))
      .toEqual({
        ...getSelect('SELECT _subquery0.value;'),
        subquerys: [{
          name: '_subquery0',
          type: 'scalar',
          value: {
            ...getSelect('SELECT _subquery0.value;'),
            subquerys: [{
              name: '_subquery0',
              type: 'scalar',
              value: {
                ...getSelect('SELECT 1;'),
                subquerys: [],
                aggregations: [],
              },
            }],
            aggregations: [],
          },
        }],
        aggregations: [],
      });
  });
  it('should handle IN', () => {
    expect(extractDependency(getSelect('SELECT a.id IN (SELECT a FROM b);')))
      .toEqual({
        ...getSelect('SELECT _subquery0.value;'),
        subquerys: [{
          name: '_subquery0',
          type: 'any',
          op: '=',
          left: getColumn('SELECT a.id;'),
          value: {
            ...getSelect('SELECT a FROM b;'),
            subquerys: [],
            aggregations: [],
          },
        }],
        aggregations: [],
      });
  });
  it('should handle EXISTS', () => {
    expect(extractDependency(getSelect('SELECT EXISTS (SELECT a FROM b);')))
      .toEqual({
        ...getSelect('SELECT _subquery0.value;'),
        subquerys: [{
          name: '_subquery0',
          type: 'exists',
          value: {
            ...getSelect('SELECT a FROM b;'),
            subquerys: [],
            aggregations: [],
          },
        }],
        aggregations: [],
      });
  });
});
