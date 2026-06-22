import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { authoringDiagnostic, type IAuthoringDiagnostic } from "./diagnostics.js";
import { formatAuthoringDocument } from "./format.js";
import { isGeneratedBundleArtifactFile } from "./sourceKinds.js";

export type AuthoringDocumentKind = "asset" | "audio" | "environment" | "input" | "material" | "mesh" | "prefab" | "project" | "resources" | "runtime" | "scene" | "systems" | "ui" | "unknown";

export interface IAuthoringDocument {
  file: string;
  projectRelativePath: string;
  kind: AuthoringDocumentKind;
  data: unknown;
}

export interface IReadAuthoringDocumentResult {
  document?: IAuthoringDocument;
  diagnostics: IAuthoringDiagnostic[];
}

const generatedPathSegments = new Set(["dist", "game.bundle", ".tn-capture"]);

export async function readAuthoringJsonDocument(projectPath: string, file: string): Promise<IReadAuthoringDocumentResult> {
  const absoluteFile = resolve(projectPath, file);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteFile));

  if (isGeneratedArtifactPath(projectRelativePath)) {
    return {
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
          file: projectRelativePath,
          message: "Generated bundle artifacts cannot be used as authoring source documents.",
          suggestion: "Edit structured source documents under content/ or src/ instead.",
        }),
      ],
    };
  }

  try {
    const raw = await readFile(absoluteFile, "utf8");
    const data = JSON.parse(raw) as unknown;
    return {
      document: {
        file: absoluteFile,
        projectRelativePath,
        kind: classifyAuthoringDocument(projectRelativePath, data),
        data,
      },
      diagnostics: [],
    };
  } catch (error) {
    return {
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_DOCUMENT_READ_FAILED",
          file: projectRelativePath,
          message: `Could not read authoring document '${projectRelativePath}'.`,
          value: error instanceof Error ? error.message : String(error),
          suggestion: "Ensure the file exists and contains valid JSON.",
        }),
      ],
    };
  }
}

export async function writeAuthoringJsonDocument(document: IAuthoringDocument): Promise<void> {
  await writeFile(document.file, formatAuthoringDocument(document.data), "utf8");
}

export function classifyAuthoringDocument(projectRelativePath: string, data: unknown): AuthoringDocumentKind {
  if (projectRelativePath === "threenative.authoring.json") {
    return "project";
  }

  const suffixKind = classifyAuthoringDocumentPath(projectRelativePath);
  if (suffixKind !== "unknown") {
    return suffixKind;
  }

  if (projectRelativePath.endsWith(".scene.json")) {
    return "scene";
  }

  if (isRecord(data)) {
    switch (data.schema) {
      case "threenative.assets":
        return "asset";
      case "threenative.audio":
        return "audio";
      case "threenative.environment-scene":
        return "environment";
      case "threenative.input":
        return "input";
      case "threenative.materials":
        return "material";
      case "threenative.meshes":
        return "mesh";
      case "threenative.prefab":
        return "prefab";
      case "threenative.authoring":
        return "project";
      case "threenative.runtime-config":
        return "runtime";
      case "threenative.resources":
        return "resources";
      case "threenative.scene":
        return "scene";
      case "threenative.systems":
        return "systems";
      case "threenative.ui":
        return "ui";
      default:
        break;
    }
  }

  return "unknown";
}

export function classifyAuthoringDocumentPath(projectRelativePath: string): AuthoringDocumentKind {
  if (projectRelativePath === "threenative.authoring.json" || projectRelativePath === "project.authoring.json" || projectRelativePath.endsWith("/project.authoring.json")) {
    return "project";
  }
  if (projectRelativePath.endsWith(".assets.json")) {
    return "asset";
  }
  if (projectRelativePath.endsWith(".audio.json")) {
    return "audio";
  }
  if (projectRelativePath.endsWith(".environment.json")) {
    return "environment";
  }
  if (projectRelativePath.endsWith(".input.json")) {
    return "input";
  }
  if (projectRelativePath.endsWith(".materials.json")) {
    return "material";
  }
  if (projectRelativePath.endsWith(".meshes.json")) {
    return "mesh";
  }
  if (projectRelativePath.endsWith(".prefab.json")) {
    return "prefab";
  }
  if (projectRelativePath.endsWith(".runtime.json")) {
    return "runtime";
  }
  if (projectRelativePath.endsWith(".resources.json")) {
    return "resources";
  }
  if (projectRelativePath.endsWith(".scene.json")) {
    return "scene";
  }
  if (projectRelativePath.endsWith(".systems.json")) {
    return "systems";
  }
  if (projectRelativePath.endsWith(".ui.json")) {
    return "ui";
  }
  return "unknown";
}

export function isGeneratedArtifactPath(projectRelativePath: string): boolean {
  const normalized = normalizeRelativePath(projectRelativePath);
  const basename = normalized.split("/").pop() ?? normalized;
  return isGeneratedBundleArtifactFile(basename) || normalized.split("/").some((segment) => generatedPathSegments.has(segment));
}

export function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
