import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { classifyLiveSceneUpdate, type IEditorLiveSceneUpdate } from "../preview/liveSceneUpdates.js";

export interface IEditorProjectWatchEvent {
  diagnostics: IEditorLiveSceneUpdate["diagnostics"];
  liveUpdate: IEditorLiveSceneUpdate;
  path: string;
  shouldRefresh: boolean;
}

export interface IEditorProjectWatcher {
  close: () => void;
}

export async function watchEditorProjectSources(options: {
  debounceMs?: number;
  onChange: (event: IEditorProjectWatchEvent) => void;
  projectPath: string;
}): Promise<IEditorProjectWatcher> {
  const projectRoot = resolve(options.projectPath);
  const watchers: FSWatcher[] = [];
  const pending = new Map<string, NodeJS.Timeout>();
  const debounceMs = options.debounceMs ?? 75;
  const watchDirs = await discoverWatchDirs(projectRoot);
  for (const dir of watchDirs) {
    watchers.push(watch(dir, (eventType, fileName) => {
      if (eventType !== "change" && eventType !== "rename") {
        return;
      }
      const changedPath = resolve(dir, typeof fileName === "string" ? fileName : "");
      const event = classifyEditorProjectWatchPath(projectRoot, changedPath);
      if (!event.shouldRefresh) {
        return;
      }
      const previous = pending.get(event.path);
      if (previous !== undefined) {
        clearTimeout(previous);
      }
      pending.set(event.path, setTimeout(() => {
        pending.delete(event.path);
        options.onChange(event);
      }, debounceMs));
    }));
  }
  return {
    close: () => {
      for (const timeout of pending.values()) {
        clearTimeout(timeout);
      }
      pending.clear();
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

export function classifyEditorProjectWatchPath(projectPath: string, changedPath: string): IEditorProjectWatchEvent {
  const projectRoot = resolve(projectPath);
  const absolute = resolve(changedPath);
  const projectRelative = relative(projectRoot, absolute).split("\\").join("/");
  if (projectRelative === ".." || projectRelative.startsWith("../") || projectRelative.startsWith("/") || projectRelative === "") {
    const liveUpdate = classifyLiveSceneUpdate({ changedFiles: [projectRelative || changedPath], operations: [] });
    return {
      diagnostics: [{ code: "TN_EDITOR_WATCH_PATH_REJECTED", message: "Editor project watcher ignored a path outside the project root.", path: projectRelative, severity: "warning" }],
      liveUpdate,
      path: projectRelative,
      shouldRefresh: false,
    };
  }
  if (isGeneratedPath(projectRelative)) {
    const liveUpdate = classifyLiveSceneUpdate({ changedFiles: [projectRelative], operations: [] });
    return {
      diagnostics: liveUpdate.diagnostics,
      liveUpdate,
      path: projectRelative,
      shouldRefresh: false,
    };
  }
  if (isWatchedSourcePath(projectRelative)) {
    const liveUpdate = classifyLiveSceneUpdate({ changedFiles: [projectRelative], operations: [] });
    return {
      diagnostics: liveUpdate.diagnostics,
      liveUpdate,
      path: projectRelative,
      shouldRefresh: true,
    };
  }
  const liveUpdate = classifyLiveSceneUpdate({ changedFiles: [projectRelative], operations: [] });
  return {
    diagnostics: [{ code: "TN_EDITOR_WATCH_PATH_IGNORED", message: "Editor project watcher ignored a non-source path.", path: projectRelative, severity: "info" }],
    liveUpdate,
    path: projectRelative,
    shouldRefresh: false,
  };
}

async function discoverWatchDirs(projectRoot: string): Promise<string[]> {
  const candidates = [projectRoot, resolve(projectRoot, "content"), resolve(projectRoot, "src", "scripts")];
  const dirs = new Set<string>();
  for (const candidate of candidates) {
    await collectDirs(candidate, dirs);
  }
  return [...dirs].sort();
}

async function collectDirs(dir: string, dirs: Set<string>): Promise<void> {
  const info = await stat(dir).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) {
    return;
  }
  dirs.add(dir);
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !["dist", "node_modules", ".git"].includes(entry.name)) {
      await collectDirs(resolve(dir, entry.name), dirs);
    }
  }
}

function isGeneratedPath(path: string): boolean {
  return path.startsWith("dist/") || path.includes("/dist/") || path.endsWith(".ir.json") || path === "assets.manifest.json";
}

function isWatchedSourcePath(path: string): boolean {
  return path === "threenative.authoring.json" || path.startsWith("src/scripts/") || /^content\/.+\.(?:scene|prefab|materials|meshes|assets|ui|input|systems|audio|environment)\.json$/.test(path);
}
