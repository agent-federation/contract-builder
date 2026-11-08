/**
 * Usage and I/O failures the PAP CLI maps to stable exit codes.
 */

export class UsageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UsageError";
    this.code = code;
  }
}

export class IoFailure extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
    readonly exitCode: 74 | 70 = 74,
  ) {
    super(message);
    this.name = "IoFailure";
    this.code = code;
  }
}
