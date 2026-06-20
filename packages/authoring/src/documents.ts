import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { authoringDiagnostic, type IAuthoringDiagnostic } from "./diagnostics.js";
import { formatAuthoringDocument } from "./format.js";

export type AuthoringDocumentKind = "scene" | "project" | "unknown";

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

  if (projectRelativePath.endsWith(".scene.json")) {
    return "scene";
  }

  if (isRecord(data) && data.schema === "threenative.scene") {
    return "scene";
  }

  if (isRecord(data) && data.schema === "threenative.authoring") {
    return "project";
  }

  return "unknown";
}

export function isGeneratedArtifactPath(projectRelativePath: string): boolean {
  const normalized = normalizeRelativePath(projectRelativePath);
  return normalized === "scripts.bundle.js" || normalized.endsWith("/scripts.bundle.js") || normalized.split("/").some((segment) => generatedPathSegments.has(segment));
}

export function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
