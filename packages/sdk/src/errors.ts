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

export function assertNonNegativeNumber(value: number, code: string, label: string): void {
  assertFiniteNumber(value, code, label);
  if (value < 0) {
    throw new SdkError(code, `${label} must be zero or greater.`);
  }
}

export function assertNormalizedNumber(value: number, code: string, label: string): void {
  assertFiniteNumber(value, code, label);
  if (value < 0 || value > 1) {
    throw new SdkError(code, `${label} must be between 0 and 1.`);
  }
}
