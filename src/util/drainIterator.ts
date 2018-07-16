export default async function drainIterator<T>(
  iterable: AsyncIterableIterator<T[]>, arg?: any,
): Promise<T[]> {
  let output: T[] = [];
  let hasNext = true;
  let it = iterable[Symbol.asyncIterator]();
  do {
    let result = await it.next(arg);
    hasNext = !result.done;
    output.push.apply(output, result.value);
  } while(hasNext);
  return output;
}
