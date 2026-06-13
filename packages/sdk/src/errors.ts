export class SdkError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SdkError";
  }
}

export function assertFiniteNumber(value: number, code: string, label: string): void {
  if (!Number.isFinite(value)) {
    throw new SdkError(code, `${label} must be a finite number.`);
  }
}

export function assertPositiveNumber(value: number, code: string, label: string): void {
  assertFiniteNumber(value, code, label);
  if (value <= 0) {
    throw new SdkError(code, `${label} must be greater than zero.`);
  }
}
