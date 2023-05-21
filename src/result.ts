abstract class ResultClass<T, E> {
  abstract readonly ok: boolean;

  abstract assertOk(): T;

  static Ok<T>(value: T): Ok<T> {
    return new Ok(value);
  }

  static Err<E>(error: E): Err<E> {
    return new Err(error);
  }
}

class Ok<T> extends ResultClass<T, never> {
  readonly ok = true;

  constructor(public value: T) {
    super();
  }

  assertOk(): T {
    return this.value;
  }
}

class Err<E> extends ResultClass<never, E> {
  readonly ok = false;

  constructor(public error: E) {
    super();
  }

  assertOk(): never {
    throw new Error("assertOk called on Err");
  }
}

const Result = ResultClass;

type Result<T, E> = Ok<T> | Err<E>;

export { Result };
