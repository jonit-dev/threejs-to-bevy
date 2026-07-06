export interface ICommandResult {
  exitCode: number;
  stderr?: string;
  stdout: string;
}

export interface IDiagnosticPayload {
  code: string;
  fix?: {
    instruction: string;
    [key: string]: unknown;
  };
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
  const body = options.json ? `${JSON.stringify(normalizedPayload, null, 2)}\n` : `${formatHumanDiagnostic(payload)}\n`;

  if (!options.json && options.stderr === true) {
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

function formatHumanDiagnostic(payload: IDiagnosticPayload): string {
  const lines = [payload.message];
  if (payload.fix?.instruction !== undefined) {
    lines.push(`Fix: ${payload.fix.instruction}`);
  }
  return lines.join("\n");
}

export function formatPackageRepairHintDiagnostic(options: {
  artifactPath: string;
  code?: string;
  message: string;
  suggestion: string;
  target: string;
}): IDiagnosticPayload {
  return {
    artifactPath: options.artifactPath,
    code: options.code ?? "TN_PACKAGE_SUPPORT_ARTIFACT_REPAIR_HINT",
    message: options.message,
    severity: "error",
    suggestion: options.suggestion,
    target: options.target,
  };
}
