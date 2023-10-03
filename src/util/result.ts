abstract class ResultClass {
  abstract readonly ok: boolean;

  static ok<T>(value: T): Ok<T> {
    return new Ok(value);
  }

  static err<E>(error: E): Err<E> {
    return new Err(error);
  }
}

class Ok<T> extends ResultClass {
  readonly ok = true;

  constructor(public value: T) {
    super();
  }
}

class Err<E> extends ResultClass {
  readonly ok = false;

  constructor(public error: E) {
    super();
  }
}

const Result = ResultClass;

type Result<T, E> = Ok<T> | Err<E>;

export { Result };
