import { SdkError } from "./errors.js";
import { defineScene, type ISceneLifecycleDeclaration, type ISceneLifecycleOptions } from "./sceneLifecycle.js";

export interface IAuthoringSourceMetadata {
  sourceId?: string;
  sourcePath?: string;
}

export interface ISceneModuleOptions extends ISceneLifecycleOptions {
  source?: IAuthoringSourceMetadata;
}

export interface ISceneModuleDeclaration extends ISceneLifecycleDeclaration {
  authoring?: IAuthoringSourceMetadata;
}

export function defineSceneModule(options: ISceneModuleOptions): ISceneModuleDeclaration {
  const scene = defineScene(options);
  const source = normalizeSourceMetadata(options.source, scene.id);
  return {
    ...scene,
    ...(source === undefined ? {} : { authoring: source }),
  };
}

function normalizeSourceMetadata(source: IAuthoringSourceMetadata | undefined, fallbackId: string): IAuthoringSourceMetadata | undefined {
  if (source === undefined) {
    return { sourceId: fallbackId };
  }
  const normalized: IAuthoringSourceMetadata = {};
  const sourceId = source.sourceId ?? fallbackId;
  assertLogicalId(sourceId);
  normalized.sourceId = sourceId;
  if (source.sourcePath !== undefined) {
    normalized.sourcePath = normalizeSourcePath(source.sourcePath);
  }
  return normalized;
}

function assertLogicalId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) {
    throw new SdkError("TN_SDK_AUTHORING_SOURCE_ID_INVALID", "Authoring sourceId must be a non-empty logical ID using letters, numbers, '.', ':', '_' or '-'.");
  }
}

function normalizeSourcePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized === ".." ||
    normalized.includes("/.generated/") ||
    normalized.startsWith(".generated/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("build/") ||
    normalized.startsWith("game.bundle/") ||
    normalized.endsWith(".bundle")
  ) {
    throw new SdkError("TN_SDK_AUTHORING_SOURCE_PATH_INVALID", "Authoring sourcePath must be a source-owned, project-relative path.");
  }
  return normalized;
}
