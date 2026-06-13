import type { ICompilerDiagnostic } from "./diagnostics.js";

export class CompilerError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly diagnostic?: ICompilerDiagnostic,
  ) {
    super(message);
    this.name = "CompilerError";
  }
}
