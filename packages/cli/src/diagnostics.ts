export interface ICommandResult {
  exitCode: number;
  stderr?: string;
  stdout: string;
}

export interface IDiagnosticPayload {
  code: string;
  message: string;
  severity?: "error" | "warning" | "info";
  [key: string]: unknown;
}

export function diagnosticResult(
  payload: IDiagnosticPayload,
  options: { exitCode: number; json: boolean; stderr?: boolean },
): ICommandResult {
  const normalizedPayload =
    options.exitCode === 0 || payload.severity !== undefined ? payload : { ...payload, severity: "error" as const };
  const body = options.json ? `${JSON.stringify(normalizedPayload, null, 2)}\n` : `${payload.message}\n`;

  if (options.stderr === true) {
    return {
      exitCode: options.exitCode,
      stderr: body,
      stdout: "",
    };
  }

  return {
    exitCode: options.exitCode,
    stdout: body,
  };
}
