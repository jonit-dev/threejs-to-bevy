import { relative, resolve } from "node:path";

export interface IEditorBootConfig {
  bundlePath?: string;
  projectPath: string;
}

export interface IEditorBootConfigResult {
  config?: IEditorBootConfig;
  diagnostics: Array<{
    code: string;
    message: string;
    path?: string;
    severity: "error";
    suggestion?: string;
  }>;
}

export function validateEditorBootConfig(input: { bundlePath?: string; cwd?: string; projectPath?: string }): IEditorBootConfigResult {
  const cwd = resolve(input.cwd ?? process.cwd());
  if (input.projectPath === undefined || input.projectPath.trim() === "") {
    return {
      diagnostics: [
        {
          code: "TN_EDITOR_BOOT_PROJECT_MISSING",
          message: "Editor launch requires --project <path>.",
          severity: "error",
        },
      ],
    };
  }

  const projectPath = resolve(cwd, input.projectPath);
  const projectRelative = normalizeRelativePath(relative(cwd, projectPath));
  if (isUnsafeProjectPath(projectRelative)) {
    return {
      diagnostics: [
        {
          code: "TN_EDITOR_BOOT_PROJECT_UNSAFE",
          message: "Editor project path must stay in a durable source project, not generated artifacts or caches.",
          path: input.projectPath,
          severity: "error",
          suggestion: "Pass the project root that contains threenative.authoring.json or content/.",
        },
      ],
    };
  }

  if (input.bundlePath !== undefined) {
    const bundlePath = resolve(projectPath, input.bundlePath);
    const bundleRelative = normalizeRelativePath(relative(projectPath, bundlePath));
    if (bundleRelative.startsWith("../") || bundleRelative === ".." || !bundleRelative.includes("game.bundle")) {
      return {
        diagnostics: [
          {
            code: "TN_EDITOR_BOOT_BUNDLE_UNSAFE",
            message: "Editor bundle path must stay inside the selected project and point at a generated game.bundle directory.",
            path: input.bundlePath,
            severity: "error",
          },
        ],
      };
    }
    return { config: { bundlePath, projectPath }, diagnostics: [] };
  }

  return { config: { projectPath }, diagnostics: [] };
}

function isUnsafeProjectPath(projectRelative: string): boolean {
  return (
    projectRelative === ".." ||
    projectRelative.startsWith("../") ||
    projectRelative.split("/").some((segment) => segment === "dist" || segment === "game.bundle" || segment === ".tn-capture" || segment === "node_modules")
  );
}

function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}
