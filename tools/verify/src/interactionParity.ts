export interface IInteractionParitySnapshot {
  entities: string[];
  resources: Record<string, unknown>;
  traces: Array<{ completion: boolean; detector: string; effects: string[]; gate: string; interaction: string; source: string; target: string; tick: number }>;
}

export interface IInteractionParityDiagnostic {
  code: "TN_INTERACTION_PARITY_MISMATCH";
  message: string;
  path: string;
  severity: "error";
}

export function compareInteractionParity(web: IInteractionParitySnapshot, native: IInteractionParitySnapshot): IInteractionParityDiagnostic[] {
  const diagnostics: IInteractionParityDiagnostic[] = [];
  compare("traces", web.traces, native.traces);
  compare("resources", web.resources, native.resources);
  compare("entities", [...web.entities].sort(), [...native.entities].sort());
  return diagnostics;

  function compare(path: string, left: unknown, right: unknown): void {
    if (stable(left) === stable(right)) return;
    diagnostics.push({ code: "TN_INTERACTION_PARITY_MISMATCH", message: `Web and native interaction ${path} differ.`, path: `interaction-parity/${path}`, severity: "error" });
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
