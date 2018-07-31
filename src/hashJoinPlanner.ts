import deepEqual from 'deep-equal';
import { Expression } from 'yasqlp';

type HashJoinInput = {
  left: string[],
  right: string[],
};

type HashJoinPlan = {
  tables: Expression[][][],
  compares: { value: Expression[], tableId: number }[],
  leftDepends: boolean,
  rightDepends: boolean,
};

export default function planHashJoin(
  expr: Expression, left: string[], right: string[],
) {
  return planBlock(expr, { left, right });
}

// In order to use hash lookup, we need to be sure that hash lookup's result
// ends in truthy (conditionals in NOT can't be used for hash lookup)
// However, even if hash lookup doesn't end up TRUE every time, it should be
// used anyway.
// But, if there are any matching rows that doesn't get fetched by hash lookup,
// it's not possible to use hash lookup, so use cross join then.
// (If histogram shows that exclusion hash lookup is faster, it can use hash
// join, but since we don't have histogram, let's just use cross join)

function mergePlanDepend(
  ...plans: HashJoinPlan[]
): HashJoinPlan {
  return {
    tables: [],
    compares: [],
    leftDepends: plans.some(v => v.leftDepends),
    rightDepends: plans.some(v => v.rightDepends),
  };
}

function planBlock(expr: Expression, input: HashJoinInput): HashJoinPlan {
  switch (expr.type) {
    case 'logical':
      if (expr.op === '&&') {
        // AND should add more columns to the existing tables if possible
        let plans = expr.values.map(v => planBlock(v, input));
        return plans.reduce((leftPlan, rightPlan) => {
          // Append smallest plan's tuples onto larger plan.
          // (a.a = b.a OR a.b = b.b) AND a.c = b.c can be merged, however, if
          // both side has OR, it's impossible to do that.
          // (a.a = b.a OR a.b = b.b) AND (a.c = b.c OR a.d = b.d) ->
          // It's just better to use one side of plan in this case.
          let rightSmaller =
            (leftPlan.tables.length === rightPlan.tables.length &&
            leftPlan.tables.length === 1) ?
              leftPlan.tables[0].length > rightPlan.tables[0].length :
              leftPlan.tables.length > rightPlan.tables.length;
          let smallerPlan = rightSmaller ? rightPlan : leftPlan;
          let largerPlan = rightSmaller ? leftPlan : rightPlan;
          let smallerMergeable = smallerPlan.tables.length === 1 &&
            smallerPlan.tables[0].length === 1 &&
            smallerPlan.compares.length === 1;
          if (!smallerMergeable && smallerPlan.tables.length > 0) {
            return {
              tables: smallerPlan.tables,
              compares: smallerPlan.compares,
              leftDepends: smallerPlan.leftDepends || largerPlan.leftDepends,
              rightDepends: smallerPlan.rightDepends || largerPlan.rightDepends,
            };
          } else if (!smallerMergeable) {
            return {
              tables: largerPlan.tables,
              compares: largerPlan.compares,
              leftDepends: smallerPlan.leftDepends || largerPlan.leftDepends,
              rightDepends: smallerPlan.rightDepends || largerPlan.rightDepends,
            };
          } else {
            // Actually merge the tuples.
            let table = smallerPlan.tables[0];
            // For compares, perform cartesian product.
            let compares = [];
            for (let i = 0; i < largerPlan.compares.length; ++i) {
              let largerCompare = largerPlan.compares[i];
              for (let j = 0; j < smallerPlan.compares.length; ++j) {
                let smallerCompare = smallerPlan.compares[j];
                compares.push({
                  value: largerCompare.value.concat(smallerCompare.value),
                  tableId: largerCompare.tableId,
                });
              }
            }
            return {
              ...mergePlanDepend(largerPlan, smallerPlan),
              tables: largerPlan.tables.map(tbl => tbl.map(tuple => {
                return tuple.concat(table[0]);
              })),
              compares,
            };
          }
        });
      } else if (expr.op === '||') {
        // OR should add more compares.
        // Append new compares / values while checking for duplicates.
        let plans = expr.values.map(v => planBlock(v, input));
        return plans.reduce((leftPlan, rightPlan) => {
          // Check for duplicate tables - create a table ID map for this.
          // Table map can be merged into one if all referencing compares
          // are same.
          // e.g. a.a = b.a OR a.a = b.b can be merged.
          // This can be done by checking if all the compare references are
          // shared. However, this is quite complicated as we need to check
          // each table can be shared.
          // 1. Remove redundant tables and merge two tables together.
          // 2. Create compared value map of each table.
          // 3. If each table's compared value map is same, it can be merged
          //    into one.
          // Thus, it is essentially O(m*n^2) and is expensive.

          // Remove redundant tables and merge two tables together.
          let newTables: Expression[][][] = leftPlan.tables.slice();
          let tableMap = rightPlan.tables.map((table, i) => {
            let index = leftPlan.tables.findIndex(v => deepEqual(table, v));
            if (index === -1) {
              newTables.push(table);
              return leftPlan.tables.length + i;
            } else {
              return index;
            }
          });
          let tableRefs: Expression[][][] = newTables.map(() => []);
          // Create compared value map of each table.
          leftPlan.compares.forEach(v => {
            tableRefs[v.tableId].push(v.value);
          });
          rightPlan.compares.forEach(v => {
            let refs = tableRefs[tableMap[v.tableId]];
            if (refs.find(ref => deepEqual(ref, v.value)) == null) {
              refs.push(v.value);
            }
          });
          // Merge tables into one if it can be merged.
          let tableMerged: boolean[] = newTables.map(() => false);
          for (let i = 0; i < newTables.length; ++i) {
            if (tableMerged[i]) continue;
            for (let j = i + 1; j < newTables.length; ++j) {
              // Compare table refs.
              // TODO This is sensitive to order - reorder them or use hashcode.
              if (deepEqual(tableRefs[i], tableRefs[j])) {
                tableMerged[j] = true;
                newTables[i] = newTables[i].concat(newTables[j]);
              }
            }
          }
          // Recreate compares from table references.
          let newCompares: { value: Expression[], tableId: number }[] = [];
          for (let i = 0; i < newTables.length; ++i) {
            if (tableMerged[i]) continue;
            tableRefs[i].forEach(v => {
              newCompares.push({ value: v, tableId: i });
            });
          }
          newTables = newTables.filter((_, i) => !tableMerged[i]);
          return {
            ...mergePlanDepend(leftPlan, rightPlan),
            tables: newTables,
            compares: newCompares,
          };
        });
      }
      break;
    case 'compare': {
      // See if each side has left or right table, and create hash table
      let leftPlan = planBlock(expr.left, input);
      let rightPlan = planBlock(expr.right, input);
      let isHashable = leftPlan.leftDepends !== rightPlan.leftDepends &&
        leftPlan.rightDepends !== rightPlan.rightDepends;
      if (isHashable && expr.op === '=') {
        let leftDepender = leftPlan.leftDepends ? expr.left : expr.right;
        let rightDepender = leftPlan.rightDepends ? expr.left : expr.right;
        // Create new hash table.
        let tables = [[[rightDepender]]];
        let compares = [{ value: [leftDepender], tableId: 0 }];
        return {
          ...mergePlanDepend(leftPlan, rightPlan),
          tables,
          compares,
        };
      } else {
        return mergePlanDepend(leftPlan, rightPlan);
      }
    }
    case 'between':
    case 'in':
    case 'aggregation':
      // This must be not present
      break;
    case 'unary':
      // ??
      break;
    case 'binary': {
      let leftPlan = planBlock(expr.left, input);
      let rightPlan = planBlock(expr.right, input);
      return mergePlanDepend(leftPlan, rightPlan);
    }
    case 'function': {
      let plans = expr.args.map(v => planBlock(v, input));
      return mergePlanDepend(...plans);
    }
    case 'case': {
      // If only one side's columns are present, this is still valid
      // TODO
    }
    case 'string':
    case 'number':
    case 'boolean':
    case 'default':
    case 'null':
    case 'wildcard':
      return {
        tables: [],
        compares: [],
        leftDepends: false,
        rightDepends: false,
      };
    case 'column': {
      return {
        tables: [],
        compares: [],
        leftDepends: input.left.includes(expr.table),
        rightDepends: input.right.includes(expr.table),
      };
    }
  }
}
