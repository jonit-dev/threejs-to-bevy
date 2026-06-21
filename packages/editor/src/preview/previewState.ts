import type { IAuthoringDiagnostic } from "@threenative/authoring";

export type PreviewStatus = "building" | "empty" | "error" | "ready";

export interface IPreviewState {
  bundlePath?: string;
  diagnostics: IAuthoringDiagnostic[];
  status: PreviewStatus;
  timings?: Record<string, number>;
}

export function createPreviewState(input: Partial<IPreviewState> = {}): IPreviewState {
  return {
    diagnostics: input.diagnostics ?? [],
    status: input.status ?? (input.bundlePath === undefined ? "empty" : "ready"),
    ...(input.bundlePath === undefined ? {} : { bundlePath: input.bundlePath }),
    ...(input.timings === undefined ? {} : { timings: input.timings }),
  };
}
