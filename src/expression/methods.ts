const TABLE: { [key: string]: Function } = {
  asin: (v: number) => Math.asin(v),
  acos: (v: number) => Math.acos(v),
  atan: (v: number) => Math.atan(v),
  atan2: (a: number, b: number) => Math.atan2(a, b),
  sin: (v: number) => Math.sin(v),
  cos: (v: number) => Math.cos(v),
  tan: (v: number) => Math.tan(v),
  cot: (v: number) => 1 / Math.tan(v),
  abs: (v: number) => Math.abs(v),
  sign: (v: number) => v > 0 ? 1 : (v < 0 ? -1 : 0),
  mod: (a: number, b: number) => a % b,
  ceiling: (v: number) => Math.ceil(v),
  ceil: (v: number) => Math.ceil(v),
  floor: (v: number) => Math.floor(v),
  sqrt: (v: number) => Math.sqrt(v),
  exp: (v: number) => Math.exp(v),
  power: (a: number, b: number) => Math.pow(a, b),
  ln: (v: number) => Math.log(v),
  log: (a: number, b: number = Math.E) => Math.log(a) / Math.log(b),
  log10: (v: number) => Math.log10(v),
  rand: () => Math.random(),
  greatest: (...args: number[]) => Math.max.apply(Math, args),
  least: (...args: number[]) => Math.min.apply(Math, args),
  coalesce: (...args: any[]) => args.find(v => v != null),
};

export default TABLE;
