import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import type { IAssetReloadReportIr, IGltfSceneMetadataIr } from "@threenative/ir";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { startDevWatch, type IDevWatchSession } from "../dev/watch.js";
import { runBevyRuntime, type BevyRuntimeProcess, type BevyRuntimeRunner } from "../native/bevy.js";

export interface IDevResult extends ICommandResult {
  process?: BevyRuntimeProcess;
  server?: IWebPreviewServer;
  watcher?: IDevWatchSession;
}

export interface IDevCommandOptions {
  bevyRunner?: BevyRuntimeRunner;
}

export interface IDevAssetReloadChange {
  afterGltfScene?: IGltfSceneMetadataIr;
  assetId: string;
  beforeGltfScene?: IGltfSceneMetadataIr;
  path: string;
}

export async function devCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IDevCommandOptions = {},
): Promise<IDevResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const targetFlagIndex = normalizedArgv.indexOf("--target");
  const target = targetFlagIndex === -1 ? undefined : normalizedArgv[targetFlagIndex + 1];
  const watchMode = normalizedArgv.includes("--watch");
  const debugColliders = normalizedArgv.includes("--debug") || normalizedArgv.includes("--debug-colliders");

  if (target !== "web" && target !== "desktop") {
    return diagnosticResult(
      {
        code: "TN_DEV_TARGET_UNSUPPORTED",
        message: "V1 currently supports 'tn dev --target web' and 'tn dev --target desktop'.",
        target,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const projectPath = projectFlagIndex === -1 ? cwd : resolve(cwd, normalizedArgv[projectFlagIndex + 1] ?? ".");

  try {
    if (watchMode) {
      const watcher = await startDevWatch(projectPath);
      const bundlePath = watcher.initialReport.bundlePath;
      const server = target === "web" && bundlePath !== undefined ? await startWebPreview({ bundlePath }) : undefined;
      const url = server === undefined ? undefined : previewUrl(server.url, debugColliders);
      const payload = {
        code: "TN_DEV_WATCH_READY",
        debugColliders,
        initialReport: watcher.initialReport,
        message:
          watcher.initialReport.status === "pass"
            ? "Watch mode ready. Rebuild diagnostics will be reported after source changes."
            : "Watch mode ready with build diagnostics. Fix the reported issue and save again.",
        url,
        watchedPaths: watcher.watchedPaths,
      };

      return {
        exitCode: 0,
        server,
        stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
        watcher,
      };
    }

    const bundlePath = await ensureProjectBundle(projectPath);
    const metadata = await bundleMetadata(bundlePath);

    if (target === "desktop") {
      const process = (options.bevyRunner ?? runBevyRuntime)({ bundlePath });
      const payload = {
        bundlePath,
        ...metadata,
        code: "TN_DEV_DESKTOP_READY",
        message: "Desktop preview starting with Bevy runtime.",
      };

      return {
        exitCode: 0,
        process,
        stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
      };
    }

    const server = await startWebPreview({ bundlePath, metadata });
    const url = previewUrl(server.url, debugColliders);
    const payload = {
      bundlePath,
      ...metadata,
      code: "TN_DEV_WEB_READY",
      debugColliders,
      diagnostics: [
        {
          code: "TN_DEV_NOT_WATCHING",
          message: "Web preview is serving the bundle built at startup; run with --watch for rebuilds after source changes.",
          severity: "warning",
          suggestion: "Use tn dev --target web --watch for the edit/build/preview loop.",
        },
      ],
      message: `Web preview ready at ${url}`,
      url,
    };

    return {
      exitCode: 0,
      server,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_DEV_FAILED", message }, { exitCode: 1, json, stderr: true });
  }
}

function previewUrl(url: string, debugColliders: boolean): string {
  if (!debugColliders) {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set("debugColliders", "1");
  return parsed.toString();
}

export function classifyDevAssetReload(change: IDevAssetReloadChange): IAssetReloadReportIr {
  const extension = change.path.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg"].includes(extension)) {
    return {
      changedAssets: [{ assetId: change.assetId, change: "changed", path: change.path }],
      classification: "reloadable",
      diagnostics: [],
      impactedHandles: [],
      schema: "threenative.asset-reload",
      statePolicy: "preserve",
      version: "0.1.0",
    };
  }
  if (extension === "gltf" || extension === "glb") {
    const removedHandles = removedGltfHandlePaths(change.assetId, change.beforeGltfScene, change.afterGltfScene);
    if (removedHandles.length > 0) {
      return {
        changedAssets: [{ assetId: change.assetId, change: "changed", path: change.path }],
        classification: "rebuildRequired",
        diagnostics: [
          {
            code: "TN_DEV_ASSET_RELOAD_GLTF_TOPOLOGY_CHANGED",
            message: `glTF asset '${change.assetId}' removed or renamed ${removedHandles.length} spawned handle node(s).`,
            path: change.path,
            severity: "error",
            suggestion: "Rebuild the bundle so spawned glTF handle topology matches the authored metadata.",
          },
        ],
        impactedHandles: removedHandles,
        schema: "threenative.asset-reload",
        statePolicy: "rebuild",
        version: "0.1.0",
      };
    }
    return {
      changedAssets: [{ assetId: change.assetId, change: "changed", path: change.path }],
      classification: "statePreservingReload",
      diagnostics: [],
      impactedHandles: [],
      schema: "threenative.asset-reload",
      statePolicy: "preserve",
      version: "0.1.0",
    };
  }
  return {
    changedAssets: [{ assetId: change.assetId, change: "unsupportedExtension", path: change.path }],
    classification: "unsupported",
    diagnostics: [
      {
        code: "TN_DEV_ASSET_RELOAD_EXTENSION_UNSUPPORTED",
        message: `Asset '${change.assetId}' uses unsupported reload extension '${extension}'.`,
        path: change.path,
        severity: "error",
        suggestion: "Edit a declared texture or glTF asset, or rebuild the project.",
      },
    ],
    impactedHandles: [],
    schema: "threenative.asset-reload",
    statePolicy: "restart",
    version: "0.1.0",
  };
}

function removedGltfHandlePaths(assetId: string, before: IGltfSceneMetadataIr | undefined, after: IGltfSceneMetadataIr | undefined): string[] {
  const beforePaths = new Set(
    before?.assets.find((asset) => asset.assetId === assetId)?.nodes
      .filter((node) => node.spawnedHandleEligible)
      .map((node) => node.path) ?? [],
  );
  const afterPaths = new Set(after?.assets.find((asset) => asset.assetId === assetId)?.nodes.map((node) => node.path) ?? []);
  return [...beforePaths].filter((path) => !afterPaths.has(path)).sort((left, right) => left.localeCompare(right));
}

async function ensureProjectBundle(projectPath: string): Promise<string> {
  const build = await buildProject(projectPath);
  const bundlePath = build.bundlePath;

  const report = await validateBundle(bundlePath);
  if (!report.ok) {
    throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  }

  return bundlePath;
}

async function bundleMetadata(bundlePath: string): Promise<{ buildTime: string; bundleHash: string; sourceBuildStatus: "current" }> {
  const manifestPath = resolve(bundlePath, "manifest.json");
  const [manifest, manifestStat] = await Promise.all([readFile(manifestPath), stat(manifestPath)]);
  return {
    buildTime: manifestStat.mtime.toISOString(),
    bundleHash: createHash("sha256").update(manifest).digest("hex"),
    sourceBuildStatus: "current",
  };
}
