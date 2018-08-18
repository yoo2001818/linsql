export default interface Aggregate {
  init(): void;
  next(value: any): void;
  finalize(): any;
}
