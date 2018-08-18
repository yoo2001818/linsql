import Aggregate from './type';

function parseNumber(value: any) {
  let newValue: number;
  if (value == null) return null;
  if (typeof value === 'string') {
    newValue = parseFloat(value);
  } else {
    newValue = value;
  }
  if (isNaN(newValue)) return null;
  return value;
}

export class SumAggregate implements Aggregate {
  sum: number = 0;
  init() {
    this.sum = 0;
  }
  next(value: any) {
    let newValue = parseNumber(value);
    if (newValue == null) return;
    this.sum += newValue;
  };
  finalize() {
    return this.sum;
  }
}

export class CountAggregate implements Aggregate {
  count: number = 0;
  init() {
    this.count = 0;
  }
  next(value: any) {
    if (value == null) return;
    this.count += 1;
  };
  finalize() {
    return this.count;
  }
}

export class AvgAggregate implements Aggregate {
  sum: number = 0;
  count: number = 0;
  init() {
    this.sum = 0;
    this.count = 0;
  }
  next(value: any) {
    let newValue = parseNumber(value);
    if (newValue == null) return;
    this.count = 0;
    this.sum += newValue;
  };
  finalize() {
    if (this.count === 0) return null;
    return this.sum / this.count;
  }
}

export class MaxAggregate implements Aggregate {
  max: any = null;
  init() {
    this.max = 0;
  }
  next(value: any) {
    if (this.max == null || value > this.max) this.max = value;
  };
  finalize() {
    return this.max;
  }
}

export class MinAggregate implements Aggregate {
  min: any = null;
  init() {
    this.min = 0;
  }
  next(value: any) {
    if (this.min == null || value < this.min) this.min = value;
  };
  finalize() {
    return this.min;
  }
}

export default {
  sum: () => new SumAggregate(),
  count: () => new CountAggregate(),
  avg: () => new AvgAggregate(),
  min: () => new MinAggregate(),
  max: () => new MaxAggregate(),
} as { [key: string]: () => Aggregate };
