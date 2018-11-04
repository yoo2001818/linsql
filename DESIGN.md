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
4. Move predicate's column value to the left.
   - `'3' = a.a` to `a.a = '3'`

### Getting predicate graph
For further optimizations, we need to render a graph with columns and
predicates, so we can exploit transitivity and implement short circuit
elimination.

#### Predicate graph generation
Each column has a list of predicate with other values, a list of connections,
and names of the column. Each connection, or predicates are represented with
target value, and operator. Basically it's same as compare operator, but
without left value.

Constants are represented as AND graph's values, so actual SARG generation is
up to the index lookup iterator. This is unavoidable otherwise it's not possible
to represent `IN (SELECT ...)` operator, which is completely dynamic and thus
its SARG must be constructed after retriving whatever rows are inside it.

It's also necessary to represent non-SARGable constant values, such as
`FLOOR(a) = 5`. (In this case, if the SARG generator is smart enough, it can be
converted to `a >= 5 AND a < 6`.)

However, columns must be placed at left instead of right in order to do this.
(This should be done previous pre-process optimization)

Thus, though it's quite a bummer to not include range optimization inside here,
it's actually beneficial to move at later stage of optimization since they can
optimize at its discrection, so it'd be easier to support spatial data or
JSON data.... given that we have indexes for them. This is especially true for
non-totally ordered set.

Even though that's the case, the graph generator must defer OR expression to
the last so it can detect all the columns are the same.

For example, `a.a = b.a AND (a.a = 1 OR b.a = 2)`, OR expression must not
be moved inside leftovers.

Connections should be recorded separately for the sake of optimization; it can
be referred using node IDs, and it can be used to optimize some absurd cases:
`a.a > a.b AND a.b = 3` - We can derive `a.a > 3`.

However, this design is only elligible for AND. For queries like
`a.a = b.a OR a.a = c.a`, we need to separate query path and run union,
or run full scan. For this case, it should be generated last so descendant can
use parent's predicates data.

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
  constaints: [
    { type: 'compare', op: '>=', left: ..., right: { type: 'number', value: 3 } },
    { type: 'compare', op: '<=', left: ..., right: { type: 'number', value: 3 } },
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
eliminate unnecessary predicates like `a.id > 3 AND a.id < 1`. (This is done
at SARGs generation time.)

It might be possible to express them using special case of ANDs - which can be
converted to native expression and vice versa. It should be able to be
converted back when passing to the SARGs generator because expression evaluator
doesn't know how to handle them, and they shouldn't be. However, this is
still useful for query path generation.

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
    constraints: [
      {
        type: 'compare',
        op: '>=',
        left: { type: 'column', table: 'a', name: 'id' },
        right: { type: 'number', value: 3 },
      },
      {
        type: 'compare',
        op: '<=',
        left: { type: 'column', table: 'a', name: 'id' },
        right: { type: 'number', value: 3 },
      },
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

### Expressing aggregation / join / subquery
yasqlp returns AST for select statements. This is hardly useful for actually
executing query, as all the information is scattered across objects.

We need more efficient structure for expressing such case, which is
described below.

#### Aggregation
Aggregations are done at (almost) last step of query execution - it gets
performed after joining, before column result generation.

Aggregations are expressed in column result, however, column result can't be
run without aggregation. We need a way to get dependencies and extract them.

`SELECT MIN(a.name) FROM a;` should be converted to
`_aggr.value1`, along with aggregation dependencies.

```js
{
  type: 'aggregation',
  name: 'value1',
  table: 'a',
  op: 'min',
  value: { type: 'column', table: 'a', column: 'name' },
}
```

### Join
Select statements can put tables in any order. It is query planner's
reponsibility to reorder them to fastest order.

At the last stage of query planning, it should be converted to 'physical'
operators, so it may be pretty meaningless to rewrite AST for this.

We can think of join as 'table with constraints', unlike `FROM a, b`, etc.
yasqlp parser already represents table lookups like this, so we have no problem
with that.

### Subquery
Unlike joins, subquerys can pop out anywhere, literally. Like aggregation,
it needs walking the AST and extracting the subquery.

But subquery is performed while pulling the table information, i.e. 'selection',
so it should be in different place from aggregation list.

Subquery in columns should be converted to anonymous subquery table to process
them.

```sql
SELECT (SELECT 1) FROM a;
-- to:
SELECT _subquery1.0
  FROM a, (SELECT 1) _subquery1;
```

### Optimizing aggregation and subquerys
Converted result is not really pleasing; we need to optimize aggregations
and subquerys. Aggregation is not really optimizable, however, it's still
required to mark the table as 'group by 1' or something to perform aggregation.

Subquerys, however, has a lot of potential for optimization. We can perform
materialization, converision to join, or just eliminate them.

Since we can't use indexes at all, subquerys are extremely inefficient if
it can't be optimized. (Otherwise, it'll always end in O(n^2).... so horrible.)

#### Materialization of subquery
Is the subquery independent from the rest of the queries? If so, we can just
materialize the table and use it from the cache.

To get dependency, iterate through subquery AST and find any table from parent
query. If nothing is found, add materialization.

However, if subquery's result is being joined to other table, it may be
beneficial to forcefully insert 'order by' into the subquery, to allow lookups.

#### Converting subquery to join
Many subqueries can be converted to joins. This has some caveats since
name conflicts can occur. (Not sure if SQL allows that)

This allows using same optimization routine for joins and subqueries, which can
reduce complexity a lot.

However, subqueries has [few requirements for conversion](https://docs.oracle.com/javadb/10.8.3.0/tuning/ctuntransform36368.html)
which must be checked before the conversion.

- Subquery should't be under OR - but it may use unions, If that's cheaper.
- Subquery shouldn't use aggregation (It may use materialized table, though.)
- Subquery shouldn't use order by, limit.
  (LIMIT 1 can be converted into semi-join, and uniqueness check can be ignored
  by using semi-join.)
- Subquery's table shouldn't be another subquery (nested subquery can't be
  converted)

The following kinds of subqueries are available - 

- EXISTS
- NOT EXISTS
- IN
- NOT IN
- Scalar subquery
- Subquery table

##### EXISTS
EXISTS can be just converted into regular joins, except nothing would actually
refer that table.

```sql
SELECT * FROM a WHERE EXISTS(SELECT 1 FROM b WHERE b.name = a.name);
-- into:
SELECT a.* FROM a JOIN b _subquery1 ON b.name = a.name;
```

##### NOT EXISTS
NOT EXISTS is similiar to EXISTS, but it should use left join and 'IS NULL'
on id.

```sql
SELECT * FROM a
  WHERE NOT EXISTS(SELECT 1 FROM b WHERE b.name = a.name);
-- into:
SELECT a.* FROM a
  LEFT JOIN b _subquery1 ON _subquery1.name = a.name
  WHERE _subquery1.id IS NULL;
```

##### IN
IN can be converted to regular joins by adding `a = b` in join.

```sql
SELECT * FROM a
  WHERE a.name IN (SELECT name FROM b WHERE b.price > 10);
-- into:
SELECT a.* FROM a
  LEFT JOIN b _subquery1 ON _subquery1.name = a.name
  WHERE _subquery1.price > 10;
```

##### NOT IN
NOT IN can be converted to left joins.

```sql
SELECT * FROM a
  WHERE a.name NOT IN (SELECT name FROM b WHERE b.price > 10);
-- into:
SELECT a.* FROM a
  LEFT JOIN b _subquery1 ON _subquery1.name = a.name
  WHERE _subquery1.price > 10 AND _subquery1.id IS NULL;
```

##### Scalar subquery
Something like `SELECT (SELECT 1);` - It can be converted to left joins,
defaulting to null if not found.

Unlike other queries, this must be ensured to have one column and one row - 
so it must be proved to be unique.

```sql
SELECT a.id, (SELECT b.name FROM b WHERE a.id = b.id) FROM a;
-- into:
SELECT a.id, _subquery1.name FROM a
  LEFT JOIN b _subquery1 ON _subquery1.id = a.id;
```

If b has foreign key constraint, a can be just removed from the query.

##### Subquery table
Subquery table can't be merged well - but there's some case it can be done.

However, I can't think of the case this would be actually used, so only
materialization should be done, for now.

```sql
SELECT a.id, b.id
  FROM a, (SELECT c.* FROM c WHERE a.id = c.id) b;
-- into:
SELECT a.id, b.id
  FROM a
  JOIN c b ON a.id = c.id;
```

### Single table query retrieval
Before considering joins, we need a way to represent a single table retrieval.

Selecting tables are performed in this order, if full scan is specified:

1. Fetching tables (This includes subquery.)
2. Running where (pre)
3. Selecting columns
4. Running where (post)
5. Running order by (pre)
6. Running aggregations
7. Running having
8. Running order by (post)

If joins are specified, 1 / 2 / 4, should be performed as 'fetching tables',
and subquerys should be resolved in 'fetching tables'.

### Fetching tables
Fetching tables is the most important part of query planning; all optimizations
happen here.

We've converted all columns into AND graph before. This can be used to extract
SARGs and join relations more easily.

First table retrieval can be done using indexes, or full scan. Each required
table's retrival cost must be calculated.

Then, other tables can use nested join, or hash join, or merge join. Merge join
and hash joins requires table scanning once, while nested join can use index
match.

Join dependency graph depends on AND graph between other tables. Consider
this case:

```sql
SELECT * FROM a
  JOIN b ON a.id = b.id
  JOIN c ON b.id = c.id;
```

INNER JOIN can be merged to single AND, but any other joins can't be merged,
since NULL is used for special case. Take a look at this:

```sql
SELECT * FROM a
  LEFT JOIN b ON a.id = b.id
  WHERE b.id IS NULL;
```

a.id = b.id can't be merged into WHERE at all.

Sometimes converting OR into UNION can be much cheaper. To calculate this,
it should calculate the cost of running SELECT for each OR predicate. If that's
cheaper than any other AND, it should be used.

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
