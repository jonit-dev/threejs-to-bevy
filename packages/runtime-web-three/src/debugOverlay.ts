import type { IRuntimeDiagnostic } from "@threenative/ir";

export type WebDebugSeverity = "error" | "info" | "warning";

export interface IWebDebugDrawPrimitive {
  color?: string;
  id: string;
  kind: string;
  label?: string;
  lifetimeSeconds?: number;
  target?: string;
  value: Record<string, unknown>;
}

export interface IWebDebugCounter {
  aggregation: "frame" | "window";
  category: string;
  id: string;
  label: string;
  severity: WebDebugSeverity;
  sourcePath: string;
  value: number;
}

export interface IWebDebugOverlayInput {
  counters?: readonly IWebDebugCounter[];
  diagnostics?: readonly IRuntimeDiagnostic[];
  draw?: readonly IWebDebugDrawPrimitive[];
  fps?: number;
  fpsOverlay?: { enabled: boolean; sampleWindowFrames: number };
}

export interface IWebDebugOverlayRow {
  category: string;
  label: string;
  severity: WebDebugSeverity;
  sourcePath?: string;
  value: string;
}

export interface IWebDebugOverlayModel {
  enabled: boolean;
  primitives: IWebDebugDrawPrimitive[];
  rows: IWebDebugOverlayRow[];
}

export function renderDebugOverlay(input: IWebDebugOverlayInput): IWebDebugOverlayModel {
  const rows: IWebDebugOverlayRow[] = [];
  if (input.fpsOverlay?.enabled === true) {
    rows.push({
      category: "performance",
      label: "FPS",
      severity: "info",
      value: formatNumber(input.fps ?? 0),
    });
  }
  for (const counter of input.counters ?? []) {
    rows.push({
      category: counter.category,
      label: counter.label,
      severity: counter.severity,
      sourcePath: counter.sourcePath,
      value: formatNumber(counter.value),
    });
  }
  for (const diagnostic of input.diagnostics ?? []) {
    rows.push({
      category: diagnostic.code,
      label: diagnostic.message,
      severity: diagnostic.severity,
      sourcePath: diagnostic.path,
      value: diagnostic.suggestion ?? "",
    });
  }
  return {
    enabled: input.fpsOverlay?.enabled === true || rows.length > 0 || (input.draw?.length ?? 0) > 0,
    primitives: [...(input.draw ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    rows: rows.sort((left, right) => `${left.severity}:${left.category}:${left.label}`.localeCompare(`${right.severity}:${right.category}:${right.label}`)),
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
