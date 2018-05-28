# linsql
Language integrated SQL execution engine for Javascript, similiar to LINQ

# Example
**This library is being designed, so everything is subject to change!**

```js
let result = linq`
SELECT a, b FROM ${list}
WHERE c = 1 OR d = 1
ORDER BY a ASC;`;
```

```js
// Performs hash join
let result = linq`
SELECT list.name, list2.name FROM ${list} list
JOIN ${list2} list2 ON list.id = list2.id;`;
```

```js
// Performs aggregation
let result = linq`
SELECT user_id, SUM(price) as score FROM ${list}
GROUP BY user_id
ORDER BY score DESC;`;
```
