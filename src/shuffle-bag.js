function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export class ShuffleBag {
  #random;
  #signature = '';
  #remaining = [];
  #last;

  constructor(random = Math.random) {
    this.#random = random;
  }

  next(values) {
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 0) return undefined;

    const signature = [...uniqueValues].sort((left, right) => String(left).localeCompare(String(right))).join('\u0000');
    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#remaining = [];
      this.#last = undefined;
    }

    if (this.#remaining.length === 0) {
      this.#remaining = shuffle(uniqueValues, this.#random);
      const nextIndex = this.#remaining.length - 1;
      if (this.#remaining.length > 1 && this.#remaining[nextIndex] === this.#last) {
        [this.#remaining[0], this.#remaining[nextIndex]] = [this.#remaining[nextIndex], this.#remaining[0]];
      }
    }

    this.#last = this.#remaining.pop();
    return this.#last;
  }
}
