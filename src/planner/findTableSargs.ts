import { Expression } from 'yasqlp';
import deepEqual from 'deep-equal';

import { AndGraphExpression } from '../expression/optimize/graph';

export default function findTableSargs(
  table: string, where: Expression,
): Expression {
  // This should find sargable expressions for the given table.
  // OR must not be used in here, as it can't be used for table lookup anyway,
  // and optimizer can run UNION on it later.
  // However, OR for only single column is okay.
  let output: Expression[] = [];
  // We'll only traverse directly SARGable entries, and logical operators.
  function traverseStep(expr: Expression) {
    switch (expr.type) {
      case 'logical':
        if (expr.op === '&&') {
          expr.values.forEach(child => traverseStep(child));
        }
        break;
      case 'binary':
        if (expr.left.type === 'column' && expr.left.table === table) {
          output.push(expr);
        } else if (expr.right.type === 'column' && expr.right.table === table) {
          output.push(expr);
        }
        break;
      case 'custom':
        if (expr.customType === 'andGraph') {
          let andGraph = expr as AndGraphExpression;
          andGraph.nodes.forEach(node => {
            let targetName = node.names.find(name =>
              name.type === 'column' && name.table === table);
            if (targetName == null) return;
            node.names.forEach(name => {
              if (name !== targetName) {
                output.push({
                  type: 'compare',
                  op: '=',
                  left: targetName,
                  right: name,
                });
              }
            });
            node.constraints.forEach(expr => {
              if (expr.type === 'compare') {
                let newLeft = expr.left;
                if (node.names.some(name => deepEqual(name, newLeft))) {
                  newLeft = targetName;
                }
                let newRight = expr.right;
                if (node.names.some(name => deepEqual(name, newRight))) {
                  newRight = targetName;
                }
                output.push({ ...expr, left: newLeft, right: newRight });
              } else {
                output.push(expr);
              }
            });
            // TODO It's possible to aggregate connections to get range, but
            // let's not do that for now.
          });
        }
    }
  }
  traverseStep(where);
  if (output.length >= 2) {
    return {
      type: 'logical',
      op: '&&',
      values: output,
    };
  } else if (output.length === 1) {
    return output[0];
  } else {
    return null;
  }
}
