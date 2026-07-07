import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export { captureEntry, isSceneRoot, type ICapturedScene } from "./capture.js";
export { loadProjectConfig, type IProjectConfig } from "./config.js";
export { CompilerError } from "./errors.js";
export { emitBundle } from "./emit/bundle.js";
export { extractGltfAssetMetadata, extractGltfSceneMetadata } from "./gltf/metadata.js";
export { validateBundle } from "./validate/index.js";
export { AUTHORING_PROVENANCE_FILE, authoringProvenanceDocument, buildAuthoringProvenanceDocument } from "./authoring/provenance.js";
export type { ICompilerDiagnostic, IValidationReport } from "./diagnostics.js";
export type { IAuthoringEmittedDocument, IAuthoringProvenanceDocument, IBuildAuthoringProvenanceOptions } from "./authoring/provenance.js";
export { normalizeAuthoringGraph } from "./authoring/normalize.js";
export type {
  AuthoringDeclarationKind,
  AuthoringEmittedArtifactKind,
  AuthoringOwnershipClassification,
  IAuthoringDeclarationNode,
  IAuthoringEmittedPointer,
  IAuthoringGraph,
  IAuthoringModuleNode,
  IAuthoringOwnershipEntry,
  IAuthoringProvenance,
  IAuthoringReference,
  IAuthoringStructuredSourcePointer,
  IAuthoringSourcePointer,
} from "./authoring/graph.js";

/**
 * Builds a ThreeNative project from its `threenative.config.json`.
 *
 * The compiler captures the configured TypeScript or structured source entry,
 * emits a portable bundle, writes authoring provenance when source documents
 * are available, and validates the emitted bundle before returning. Invalid
 * authoring input or emitted IR throws `CompilerError` with a stable diagnostic
 * code and source/path metadata where available.
 */
export async function buildProject(projectPath: string): Promise<{ bundlePath: string }> {
  const { loadProjectConfig } = await import("./config.js");
  const { captureEntry } = await import("./capture.js");
  const { emitBundle } = await import("./emit/bundle.js");
  const config = await loadProjectConfig(projectPath);
  const releaseBuildLock = await acquireBuildLock(resolve(config.projectPath, config.outDir));
  try {
    const captured = await captureEntry(config);
    const authoringError = captured.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (authoringError !== undefined) {
      const { CompilerError } = await import("./errors.js");
      throw new CompilerError(authoringError.code, authoringError.message, authoringError);
    }
    const { loadAuthoringProject } = await import("@threenative/authoring");
    const authoringProject = await loadAuthoringProject({ projectPath });
    const bundlePath = await emitBundle(config, captured.root, {
      authoringDocuments: authoringProject.documents,
      authoringGraph: captured.graph,
    });
    const { validateBundle } = await import("./validate/index.js");
    const report = await validateBundle(bundlePath);
    if (!report.ok) {
      const { CompilerError } = await import("./errors.js");
      const diagnostic = report.diagnostics[0];
      throw new CompilerError(
        "TN_COMPILER_EMITTED_INVALID_BUNDLE",
        diagnostic?.message ?? "Emitted bundle is invalid.",
        diagnostic === undefined
          ? undefined
          : {
              ...diagnostic,
              code: "TN_COMPILER_EMITTED_INVALID_BUNDLE",
              severity: diagnostic.severity ?? "error",
            },
      );
    }
    return { bundlePath };
  } finally {
    await releaseBuildLock();
  }
}

async function acquireBuildLock(bundlePath: string): Promise<() => Promise<void>> {
  const lockDir = `${bundlePath}.build-lock`;
  const startedAt = Date.now();
  const token = randomUUID();
  const timeoutMs = 120_000;
  const staleMs = 300_000;

  await mkdir(dirname(lockDir), { recursive: true });

  while (true) {
    try {
      await mkdir(lockDir);
      await writeFile(resolve(lockDir, "owner.json"), `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), token }, null, 2)}\n`);
      return () => releaseBuildLock(lockDir, token);
    } catch (error) {
      if (!isFileSystemError(error, "EEXIST")) {
        throw error;
      }

      if (Date.now() - startedAt > timeoutMs) {
        const { CompilerError } = await import("./errors.js");
        throw new CompilerError("TN_COMPILER_BUILD_LOCK_TIMEOUT", `Timed out waiting for bundle build lock '${lockDir}'.`);
      }

      if (await removeStaleBuildLock(lockDir, staleMs)) {
        continue;
      }

      await sleep(100);
    }
  }
}

async function releaseBuildLock(lockDir: string, token: string): Promise<void> {
  try {
    const owner = JSON.parse(await readFile(resolve(lockDir, "owner.json"), "utf8")) as { token?: string };
    if (owner.token !== token) {
      return;
    }
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      return;
    }
    throw error;
  }

  await rm(lockDir, { force: true, recursive: true });
}

async function removeStaleBuildLock(lockDir: string, staleMs: number): Promise<boolean> {
  try {
    const info = await stat(lockDir);
    if (Date.now() - info.mtimeMs < staleMs) {
      return false;
    }
    await rm(lockDir, { force: true, recursive: true });
    return true;
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      return true;
    }
    throw error;
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}
