export class ShuffleBag<T = number> {
  constructor(random?: () => number);
  next(values: readonly T[]): T | undefined;
}
