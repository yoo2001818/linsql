import parse, { Expression } from 'yasqlp';

import rewriteGraph from '../../../expression/optimize/graph';
import { getWhere, getColumn } from '../../../util/select';

describe('rewriteNot', () => {
  it('should run simple cases', () => {
    expect(rewriteGraph(getWhere(
      'SELECT 1 WHERE a.a > 1 AND b.d = b.c AND a.a = b.c AND TRUE;')))
      .toEqual({
        type: 'custom',
        customType: 'andGraph',
        nodes: [
          {
            id: 0,
            names: [
              getColumn('SELECT a.a;'),
              getColumn('SELECT b.d;'),
              getColumn('SELECT b.c;'),
            ],
            constraints: [
              getWhere('SELECT 1 WHERE a.a > 1;'),
            ],
            connections: [],
          },
        ],
        leftovers: [
          getColumn('SELECT TRUE;'),
        ],
      });
  });
  it('should treat column-constant OR as constraint', () => {
    expect(rewriteGraph(getWhere(
      'SELECT 1 WHERE (a.a = 1 OR a.a = 2 OR a.a = 3) AND a.a = a.b;')))
      .toEqual({
        type: 'custom',
        customType: 'andGraph',
        nodes: [
          {
            id: 0,
            names: [
              getColumn('SELECT a.a;'),
              getColumn('SELECT a.b;'),
            ],
            constraints: [
              getWhere('SELECT 1 WHERE a.a = 1 OR a.a = 2 OR a.a = 3;'),
            ],
            connections: [],
          },
        ],
        leftovers: [],
      });
  });
  it('should treat connections', () => {
    expect(rewriteGraph(getWhere(
      'SELECT 1 WHERE a.a = 1 AND a.a > a.b;')))
      .toEqual({
        type: 'custom',
        customType: 'andGraph',
        nodes: [
          {
            id: 0,
            names: [
              getColumn('SELECT a.a;'),
            ],
            constraints: [
              getWhere('SELECT 1 WHERE a.a = 1;'),
            ],
            connections: [
              { id: 1, op: '>' },
            ],
          }, {
            id: 1,
            names: [
              getColumn('SELECT a.b;'),
            ],
            constraints: [],
            connections: [
              { id: 0, op: '<' },
            ],
          },
        ],
        leftovers: [],
      });
  });
  it('should convert OR in leftovers into individual AND graphs', () => {
    expect(rewriteGraph(getWhere(
      'SELECT 1 WHERE a.a = a.b AND (a.b = 1 OR a.c = 1);')))
      .toEqual({
        type: 'custom',
        customType: 'andGraph',
        nodes: [{
          id: 0,
          names: [
            getColumn('SELECT a.a;'),
            getColumn('SELECT a.b;'),
          ],
          constraints: [],
          connections: [],
        }],
        leftovers: [{
          type: 'logical',
          op: '||',
          values: [{
            type: 'custom',
            customType: 'andGraph',
            nodes: [{
              id: 0,
              names: [
                getColumn('SELECT a.a;'),
                getColumn('SELECT a.b;'),
              ],
              constraints: [
                getWhere('SELECT 1 WHERE a.b = 1;'),
              ],
              connections: [],
            }],
            leftovers: [],
          }, {
            type: 'custom',
            customType: 'andGraph',
            nodes: [{
              id: 0,
              names: [
                getColumn('SELECT a.a;'),
                getColumn('SELECT a.b;'),
              ],
              constraints: [],
              connections: [],
            }, {
              id: 2,
              names: [
                getColumn('SELECT a.c;'),
              ],
              constraints: [
                getWhere('SELECT 1 WHERE a.c = 1;'),
              ],
              connections: [],
            }],
            leftovers: [],
          }],
        }],
      });
  });
});
