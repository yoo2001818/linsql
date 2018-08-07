// Same hash code routine that Java uses.
// This might be occur hash collision - but seriously, are we gonna put
// 2.1G rows into Javascript? We don't have to worry about this - for now.
export default function hashCode(value: any): number {
  if (typeof value === 'string') {
    let result = 17;
    for (let i = 0; i < value.length; ++i) {
      result += 31 * result + value.charCodeAt(i) | 0;
    }
    return result;
  } else if (typeof value === 'number') {
    return value | 0;
  } else if (typeof value === 'boolean') {
    return value ? 1 : 0;
  } else if (Array.isArray(value)) {
    let result = 17;
    for (let i = 0; i < value.length; ++i) {
      result += 31 * result + hashCode(value[i]) | 0;
    }
    return result;
  } else {
    return 0;
  }
}
