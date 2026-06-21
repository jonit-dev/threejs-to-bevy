import { relative, resolve } from "node:path";

import type { IAuthoringDiagnostic } from "@threenative/authoring";

export interface IPreviewRouteResult {
  bundlePath?: string;
  diagnostics: IAuthoringDiagnostic[];
  ok: boolean;
}

export function validatePreviewBundleRoute(options: { bundlePath: string; projectPath: string }): IPreviewRouteResult {
  const projectPath = resolve(options.projectPath);
  const bundlePath = resolve(projectPath, options.bundlePath);
  const projectRelative = normalizeRelativePath(relative(projectPath, bundlePath));
  if (projectRelative === ".." || projectRelative.startsWith("../") || !/(^|\/)game\.bundle(\/|$)/.test(projectRelative)) {
    return {
      diagnostics: [
        {
          code: "TN_EDITOR_PREVIEW_BUNDLE_REJECTED",
          message: "Preview bundle paths must stay inside the active project and point at a generated game.bundle directory.",
          path: options.bundlePath,
          severity: "error",
        },
      ],
      ok: false,
    };
  }
  return { bundlePath, diagnostics: [], ok: true };
}

function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}
