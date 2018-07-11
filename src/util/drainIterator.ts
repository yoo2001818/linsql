export default async function drainIterator<T>(
  it: AsyncIterator<T[]>, arg?: any,
): Promise<T[]> {
  let output: T[] = [];
  let hasNext = true;
  do {
    let result = await it.next(arg);
    hasNext = !result.done;
    output.push.apply(output, result.value);
  } while(hasNext);
  return output;
}
