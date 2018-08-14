export default async function drainIterator<T>(
  iterable: AsyncIterableIterator<T[]>, arg?: any,
): Promise<T[]> {
  let output: T[] = [];
  let hasNext = true;
  let it = iterable[Symbol.asyncIterator]();
  do {
    let { done, value } = await it.next(arg);
    hasNext = !done;
    if (hasNext) {
      for (let i = 0; i < value.length; ++i) {
        output.push(value[i]);
      }
    }
  } while(hasNext);
  return output;
}
