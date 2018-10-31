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
  it('should handle aggregations', () => {
    expect(extractDependency(getSelect('SELECT COUNT(*);')))
      .toEqual({
        ...getSelect('SELECT _aggr0.value;'),
        subquerys: [],
        aggregations: [{
          name: '_aggr0',
          method: 'count',
          distinct: false,
          value: getColumn('SELECT *;'),
        }],
      });
    expect(extractDependency(getSelect('SELECT COUNT(DISTINCT *);')))
      .toEqual({
        ...getSelect('SELECT _aggr0.value;'),
        subquerys: [],
        aggregations: [{
          name: '_aggr0',
          method: 'count',
          distinct: true,
          value: getColumn('SELECT *;'),
        }],
      });
    expect(extractDependency(getSelect('SELECT MAX(a.name) a, MIN(a.name) b;')))
      .toEqual({
        ...getSelect('SELECT _aggr0.value a, _aggr1.value b;'),
        subquerys: [],
        aggregations: [{
          name: '_aggr0',
          method: 'max',
          distinct: false,
          value: getColumn('SELECT a.name;'),
        }, {
          name: '_aggr1',
          method: 'min',
          distinct: false,
          value: getColumn('SELECT a.name;'),
        }],
      });
  });
});
