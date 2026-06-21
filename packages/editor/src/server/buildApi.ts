import { access } from "node:fs/promises";
import { resolve } from "node:path";

import type { IAuthoringDiagnostic } from "@threenative/authoring";
import { buildProject, CompilerError } from "@threenative/compiler";

export interface IEditorBuildApiResult {
  bundlePath?: string;
  diagnostics: IAuthoringDiagnostic[];
  ok: boolean;
  timings: Record<string, number>;
}

export async function buildEditorPreviewApi(options: { projectPath: string }): Promise<IEditorBuildApiResult> {
  const started = Date.now();
  const projectPath = resolve(options.projectPath);
  try {
    await access(resolve(projectPath, "threenative.config.json"));
  } catch {
    return {
      diagnostics: [
        {
          code: "TN_EDITOR_BUILD_CONFIG_MISSING",
          message: "Editor preview build requires threenative.config.json in the project root.",
          severity: "error",
          suggestion: "Open a ThreeNative project or create one with tn create.",
        },
      ],
      ok: false,
      timings: { totalMs: Date.now() - started },
    };
  }
  try {
    const result = await buildProject(projectPath);
    return {
      bundlePath: result.bundlePath,
      diagnostics: [],
      ok: true,
      timings: { totalMs: Date.now() - started },
    };
  } catch (error) {
    const diagnostic =
      error instanceof CompilerError && error.diagnostic !== undefined
        ? ({ ...error.diagnostic, severity: "error" as const } satisfies IAuthoringDiagnostic)
        : ({
            code: "TN_EDITOR_BUILD_FAILED",
            message: error instanceof Error ? error.message : String(error),
            severity: "error" as const,
          } satisfies IAuthoringDiagnostic);
    return {
      diagnostics: [diagnostic],
      ok: false,
      timings: { totalMs: Date.now() - started },
    };
  }
}
