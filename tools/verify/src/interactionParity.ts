export interface IInteractionParitySnapshot {
  componentStorage?: Record<string, Record<string, string>>;
  components?: Record<string, Record<string, unknown>>;
  diagnostics?: Array<{ code: string; message: string; path: string; severity: string; suggestion?: string }>;
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
  compare("components", web.components ?? {}, native.components ?? {});
  compare("component-storage", web.componentStorage ?? {}, native.componentStorage ?? {});
  compare("diagnostics", web.diagnostics ?? [], native.diagnostics ?? []);
  return diagnostics;

  function compare(path: string, left: unknown, right: unknown): void {
    if (stable(left) === stable(right)) return;
    diagnostics.push({ code: "TN_INTERACTION_PARITY_MISMATCH", message: `Web and native interaction ${path} differ.`, path: `interaction-parity/${path}`, severity: "error" });
  }
}

export function validateInteractionResidualEvidence(snapshot: IInteractionParitySnapshot): IInteractionParityDiagnostic[] {
  const diagnostics: IInteractionParityDiagnostic[] = [];
  const ids = snapshot.traces.map((trace) => trace.interaction);
  require(stable(ids) === stable(["residual-overlap-boundary", "residual-typed-state"]), "traces", "Residual trace order must include the overlap boundary and typed/custom state interactions while excluding the legacy false-positive outside pair.");
  require((snapshot.resources.Score as { value?: unknown } | undefined)?.value === 10, "resources", "Residual resources must prove the outside overlap control did not add its legacy +100 reward.");
  const state = snapshot.components?.["residual-typed-source"];
  require((state?.Collider as { friction?: unknown } | undefined)?.friction === 0.25, "components", "Residual state must include the typed Collider patch.");
  require((state?.Health as { value?: unknown } | undefined)?.value === 2, "components", "Residual state must include the custom Health patch.");
  require(stable((state?.Transform as { rotation?: unknown } | undefined)?.rotation) === stable([0, Math.fround(0.70710677), 0, Math.fround(0.70710677)]), "components", "Residual state must include the authored quaternion rotation.");
  const storage = snapshot.componentStorage?.["residual-typed-source"];
  require(storage?.Collider === "typed" && storage?.Health === "custom" && storage?.Transform === "typed", "component-storage", "Residual storage must prove typed patches did not create custom shadow components.");
  return diagnostics;

  function require(condition: boolean, path: string, message: string): void {
    if (condition) return;
    diagnostics.push({ code: "TN_INTERACTION_PARITY_MISMATCH", message, path: `interaction-parity/residuals/${path}`, severity: "error" });
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
