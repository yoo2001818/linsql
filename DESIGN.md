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
6. Get optimal join path
   - Find out which table is best for starting fetching data
7. Construct physical, i.e. 'actual' iterators
