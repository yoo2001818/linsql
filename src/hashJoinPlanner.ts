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
        // TODO should support multiple values (more than 2)
        let leftPlan = planBlock(expr.values[0], input);
        let rightPlan = planBlock(expr.values[1], input);
        // Append smallest plan's tuples onto larger plan.
        // (a.a = b.a OR a.b = b.b) AND a.c = b.c can be merged, however, if
        // both side has OR, it's impossible to do that.
        // (a.a = b.a OR a.b = b.b) AND (a.c = b.c OR a.d = b.d) ->
        // It's just better to use one side of plan in this case.
        let rightSmaller = leftPlan.tables.length > rightPlan.tables.length;
        let smallerPlan = rightSmaller ? rightPlan : leftPlan;
        let largerPlan = rightSmaller ? leftPlan : rightPlan;
        if (smallerPlan.tables.length > 1) {
          return mergePlanDepend(smallerPlan, smallerPlan, largerPlan);
        } else if (smallerPlan.tables.length === 0) {
          return mergePlanDepend(largerPlan, largerPlan, smallerPlan);
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
            ...mergePlanDepend(largerPlan, largerPlan, smallerPlan),
            tables: largerPlan.tables.map(tbl => tbl.map(tuple => {
              return tuple.concat(table[0]);
            })),
            compares,
          };
        }
      } else if (expr.op === '||') {
        // OR should add more compares
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
