# Design of linsql

## Iterator
Linsql should use iterators internally, with each iteration returning a Promise
or a single row. Thus, all iterators have to handle both Promises and row data.

Because of this, we can't use generators internally, instead we have to
implement iterators by hand.

Or, otherwise, we can return a list of rows in a single Promise object. This is
in spec as async iterators are in ES2018? ES2019?

### Iterator types
- input
- output
- filter
- map (append new calculated columns)
- sort (order by)
- aggregate (group by)
- hashJoin
- nestedJoin
- subquery
- union / intersect / unionAll / except

## Selection
Linsql doesn't have any indices to work with, so we can just run full scan
for all the queries.

### Compiling the query equation
Most of the queries can be converted to JavaScript without any hassle. To gain
maximum speed by not reading AST every time, we should compile each query
into native Javascript.

### Where column problem
Sometimes column has to be processed before WHERE, in case like
`SELECT a + 1 as a FROM ... WHERE a = 1`. This is not really a problem since
mapping can be done easily, with retaining original row data (using symbol?).

```js
// Original data
{ a: { id: 123, firstName: 'John', lastName: 'Doe' } }
// Mapped data
{ __result: { id: 123, name: 'John Doe' }, a: { id: 123, ... } }
// Final data
{ id: 123, name: 'John Doe' }
```

### Join
However, nested queries and joins are not the case, and we have to take care of
them.

All joins with 'equal' predicates can be converted to hash join, given that
all the list reside in the memory (which is forced for in-memory query model
like this), and we know a 'smaller' array. (not necessary, though)

While a list can be generator or async generator, the user should be able to
provide some info about it - so it should be no problem. Native arrays have
length in their properties.

Multiple predicates can be used in hash join, by converting required columns
into a tuple.

However, predicates like `a > b`, `a != b`, requires nested join. Or, we could
construct an index, then compare `a > b` against it, but this is only possible
if we have only one compare directive inside the join statement.

### Subquery
Subqueries should perform hash join, or use materialized view.

## Planner
Since linsql does not support histogram, indexes, etc, it can't efficiently
execute queries - it can only exploit hash join and already ordered data
(cluster index). This means nested join should be avoided since seek is
impossible.

However, it can still, rearrange aggregation / join / subqueries to get optimal
results.

### Procedure
1. Optimize predicates
   - Eliminate unnecessary OR / AND
   - Eliminate NOT
   - Eliminate unused / unnecessary predicates
   - Associate potential possible predicates
2. Get predicate requisites
   - Translate required subquery / aggregation data
     - This gets translated to internal `_aggr` and `_subquery` table.
   - Calculate cost for each predicate evaluation
     - Usually join should be done much later, however, if filtering is
       more expensive, filtering should be done later.
3. Convert subquerys to join if possible
   - Many subquery can be converted to join, which can take benefit of
     merge joins, hash joins, materialized views, etc.
   - Since nested query performance is SO horrible for linsql, it should use
     joins
   - EXISTS can be simply removed from predicates by translating it to
     INNER JOIN with DISTINCT.
4. Separate predicates to construct join graph
   - Create graph data with sparse matrix
5. Get cost of each join graph
   - Get optimal join method for each table
   - Get optimal access method for each table
     - For some cases, postponing filter may be better
     - For subquery tables, run query planner recursively
6. Get optimal join path
   - Find out which table is best for starting fetching data
7. Construct physical, i.e. 'actual' iterators
8. If union is used, recursively call planner and merge all of them

### Pre-process Optimization
1. Convert IN / BETWEEN into separate predicates.
   - `A BETWEEN 1 AND 2` to `1 <= A AND A <= 2`
2. Move NOT to inside logical operators using De Morgan's laws, and inverse 
   compare expression's operators to eliminate NOT.
   - `NOT(A = 1)` to `A != 1`
   - `NOT(A >= 1 AND A <= 1)` to `A < 1 OR A > 1`
3. Evaluate constant expressions if possible.
   - `'a' = 'a'` to `TRUE`
   - `A = B + 5 + 3` to `A = B + 8`
   - `-A > 5` to `A < -5`
   - `A * -2 = 10` to `A = -5`

### Getting predicate graph
For further optimizations, we need to render a graph with columns and
predicates, so we can exploit transitivity and implement short circuit
elimination.

#### Predicate graph generation
Each column has a list of predicate with constant values, and connections to
other columns. Each connection, or predicates are represented with target value,
and operator. Basically it's same as compare operator, but without left value.

Constants are represented as OR, so range lookup, and IN expression both can be
represented inside it.

However, this design is only elligible for AND. For queries like
`a.a = b.a OR a.a = c.a`, we need to separate query path and run union,
or run full scan. For this case, it should be generated last so descendant can
use parent's predicates data.

However, if only single column is involved in OR, such as `a.a = 1 OR a.a = 2`,
can be handled inside this design. (However, all predicates in OR expression
must point to single column, and constant values. Otherwise, it'd be better to
treat OR value as a subquery.)

It'd be better idea to treat equality group as a cluster, so equality group can
be represented in O(N+M) space, not O(N^2) space. Other compare operators
compare with each equality group then.

Take this for example: `a.id = b.id AND a.id >= 3 AND b.id <= 3`

```js
[{
  names: [
    { type: 'column', table: 'a', name: 'id' },
    { type: 'column', table: 'b', name: 'id' },
  ],
  constants: [
    { op: '>=', value: { type: 'number', value: 3 } },
    { op: '<=', value: { type: 'number', value: 3 } },
  ],
  connections: [],
}]
```

We derived `a.id = b.id AND a.id = 3 AND b.id = 3` with no much effort.

Some extreme cases like `a.id = b.id AND b.id = c.id AND c.id = d.id AND ...`
can be also expressed without fully connecting all the graphs.

##### Handling OR and unsupported expressions
Above method should be adequate for AND expressions - but how about ORs and
unsupported expressions, like LIKE or binary functions, etc?

Inside AND, treat unsupported objects as leftovers, so they're handled last.
This should be enough for expressions like `someUDF() AND a.b = 1`, since
required rows can be retrieved by `a.b = 1`, it can be filtered using
`someUDF()` after retrieving them.

However, OR is quite difficult to handle since only one predicate of the
expression has to be satisifed to retrieve the row. -
This means that all the predicates have to be retrieved and merged to treat
them.

The only exemption is single column values - they can be read by single index
lookup, albeit it can be thought as being retrieved separately and merged.

If OR is inside AND, OR's children can utilize these information inside them,
effectively making them possible to be candidate for lookup.

For example, in case of `a.id = b.id AND (a.id = 3 OR b.id = 4)`, `a.id = 3`
is derived to be `b.id = 3` since parent indicates that `a.id = b.id`.

Or, otherwise, we can expand OR into:
`a.id = b.id AND ((a.id = b.id AND a.id = 3) OR (a.id = b.id AND b.id = 4))`,
effectively making them legible for index lookups.

Therefore, we should try to inherit from parent equality group if it's possible
to do so.

##### Expressing expression
To express complex expressions, graphs are not enough. Graphs only work when
they're composed of AND and compare expressions - we need another way.

MySQL expresses this within normal AST like `=(a.id, b.id) AND a.id = 3`,
however, while it's possible to express graphs like that, it's not able to
eliminate unnecessary predicates like `a.id > 3 AND a.id < 1`.

It might be possible to express them using special case of ANDs - which can be
converted to native expression and vice versa. It should be able to be
converted back because expression evaluator doesn't know how to handle them,
and they shouldn't be.

If we add new type of expression, named `andGraph`, we can express the
AND graphs like this:

```js
{
  type: 'andGraph',
  nodes: [{
    names: [
      { type: 'column', table: 'a', name: 'id' },
      { type: 'column', table: 'b', name: 'id' },
    ],
    constants: [
      { op: '>=', value: { type: 'number', value: 3 } },
      { op: '<=', value: { type: 'number', value: 3 } },
    ],
    connections: [],
  }],
  leftovers: [{
    type: 'boolean',
    value: true,
  }, {
    type: 'logical',
    op: 'or',
    // ...
  }],
}
```

inherited OR values should be able to extend parent's AND graph. This can be
done by completely copying the parent value, or just by reserving parent's
nodes ID.

### Converting aggregation / subquerys to table lookups
Expression evaluation mechanism cannot execute aggregation / subquery by itself.
To implement them, we must replace them into regular column lookups, Then inject
the tables before evaluating.

So, aggregation / subquery processor should convert expression to exclude them,
and output required aggregations and subquerys.

`a.c > 5 AND MIN(b.d) AND (SELECT 1)` should be converted to
`a.c > 5 AND _aggr1.value AND _subquery1.value`, along with a task list like
this:

```js
[
  {
    type: 'aggregation',
    id: 1,
    table: 'b',
    op: 'min',
    value: { type: 'column', table: 'b', column: 'd' },
  },
  {
    type: 'subquery',
    id; 1,
    value: {
      type: 'select',
      columns: [], // skipped
      // ...
    },
  },
]
```

This should be enough to express prerequisties. Optimization should be done
later.

### Optimizing aggregation and subquerys
Converted result is not really pleasing; we need to optimize aggregations
and subquerys. Aggregation is not really optimizable, however, it's still
required to mark the table as 'group by 1' or something to perform aggregation.

Subquerys, however, has a lot of potential for optimization. We can perform
materialization, converision to join, or just eliminate them.

#### Materialization of subquery
Is the subquery independent from the rest of the queries? If so, we can just
materialize the table and use it from the cache.

To get dependency, iterate through subquery AST and find any table from parent
query. If nothing is found, add materialization.

However, if subquery's result is being joined to other table, it may be
beneficial to forcefully insert 'order by' into the subquery, to allow lookups.

#### Optimizing exists / single column query
Single column query / exists may be converted to joins. Especially exists -
it just has to be converted to JOIN with LIMIT 1.
Single column query can also be converted to joins.

### Calculate join dependency graph
After optimization, we can finally generate join dependency graph.

Join dependency graph should be able to represent:
- Predicates between two tables (edge)
- Predicate to retrieve the table (node)

To do that, we'll have to traverse all WHERE clauses and constructing the graph.

TODO: How do we handle OR?

### Calculate cost of table retrieval
We finally know how to fetch individual table at this stage. Use indexes / or
just scan the whole table. However, linsql doesn't provideany indexes, it'd
always be full table scan, so basically all table's retriveval cost will be
same - O(n).

### Calculate cost between tables
Judguing by table's predicates and sorted state, we can perform either
merge join or hash join. Nested join and cross join should be avoided if
possible since linsql lacks indexes.

Hash join can be performed if all predicates use '='.
Merge join can be performed if all predicates use '=', and both tables are
sorted in right order.

If none are possible, we should resort to cross join. This shouldn't really
happen since only one '=' is required to perform hash or merge join - other
predicates can be checked later.

If left / right join is specified, the join can be 'one-way' - the other way
around is prohibitively expensive. This applies for hash join.

### Getting optimal join path
After costs are estimated, choose the best table join path. This might be done
by constructing minimum spanning tree, and choosing best starting table (which
has minimum cost of starting).

However, since linsql lacks indexes, full table retrieval is always performed.
So just picking any table would be fine though.

### Constructing physical iterators
After generating join path and table retrieval information, we can finally
construct physical iterators and start retrieving data.
