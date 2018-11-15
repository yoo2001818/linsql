import { Expression } from 'yasqlp';

import { rewriteConstant, rewriteSargable } from './algebra';
import { rewriteBetweenIn, rewriteNot } from './boolean';
import rewriteGraph from './graph';

export default function optimize(expr: Expression) {
  let output = rewriteBetweenIn(expr);
  output = rewriteNot(output);
  output = rewriteConstant(output);
  output = rewriteSargable(output);
  return rewriteGraph(output);
}
