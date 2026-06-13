export class R3fCaptureError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly suggestion: string,
  ) {
    super(message);
    this.name = "R3fCaptureError";
  }
}
