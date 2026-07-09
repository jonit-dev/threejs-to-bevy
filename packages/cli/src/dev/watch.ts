import { access, watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import { buildProject, CompilerError, generateProjectTypes, loadProjectConfig, validateBundle, type ICompilerDiagnostic } from "@threenative/compiler";

export interface IWatchDiagnostic {
  code: string;
  file: string;
  message: string;
  severity: "error" | "info";
  suggestedFix?: string;
}

export interface IWatchReport {
  bundlePath?: string;
  code: "TN_DEV_WATCH_REBUILD_OK" | "TN_DEV_WATCH_REBUILD_FAILED";
  diagnostics: IWatchDiagnostic[];
  lastGoodBundlePath?: string;
  projectPath: string;
  stale?: boolean;
  status: "pass" | "fail";
}

export interface IDevWatchSession {
  close(): void;
  initialReport: IWatchReport;
  rebuild(): Promise<IWatchReport>;
  watchedPaths: string[];
}

interface IDevWatchOptions {
  debounceMs?: number;
  onReport?: (report: IWatchReport) => void;
  watchFiles?: boolean;
}

export async function startDevWatch(projectPath: string, options: IDevWatchOptions = {}): Promise<IDevWatchSession> {
  const resolvedProjectPath = resolve(projectPath);
  const watchedPaths = await collectWatchedPaths(resolvedProjectPath);
  const initialReport = await rebuildProject(resolvedProjectPath);
  let lastGoodBundlePath = initialReport.status === "pass" ? initialReport.bundlePath : undefined;
  options.onReport?.(initialReport);

  const watchers: FSWatcher[] = [];
  let timer: NodeJS.Timeout | undefined;

  const rebuild = async () => {
    const report = markStaleBuild(await rebuildProject(resolvedProjectPath), lastGoodBundlePath);
    if (report.status === "pass") {
      lastGoodBundlePath = report.bundlePath;
    }
    options.onReport?.(report);
    return report;
  };

  if (options.watchFiles !== false) {
    for (const watchedPath of watchedPaths) {
      watchers.push(
        watch(watchedPath, { persistent: true }, () => {
          if (timer !== undefined) {
            clearTimeout(timer);
          }
          timer = setTimeout(() => {
            void rebuild();
          }, options.debounceMs ?? 100);
        }),
      );
    }
  }

  return {
    close() {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      for (const watcher of watchers) {
        watcher.close();
      }
    },
    initialReport,
    rebuild,
    watchedPaths,
  };
}

function markStaleBuild(report: IWatchReport, lastGoodBundlePath: string | undefined): IWatchReport {
  if (report.status === "pass" || lastGoodBundlePath === undefined) {
    return report;
  }
  return {
    ...report,
    lastGoodBundlePath,
    stale: true,
    diagnostics: [
      ...report.diagnostics,
      {
        code: "TN_DEV_WATCH_LAST_GOOD_STALE",
        file: lastGoodBundlePath,
        message: `Rebuild failed; preview should keep serving last good bundle '${lastGoodBundlePath}'.`,
        severity: "info",
        suggestedFix: "Fix the reported source error; the next passing rebuild will replace the stale preview bundle.",
      },
    ],
  };
}

async function rebuildProject(projectPath: string): Promise<IWatchReport> {
  try {
    const config = await loadProjectConfig(projectPath);
    await generateProjectTypes({ projectPath });
    const build = await buildProject(projectPath);
    const validation = await validateBundle(build.bundlePath);

    if (!validation.ok) {
      return {
        bundlePath: build.bundlePath,
        code: "TN_DEV_WATCH_REBUILD_FAILED",
        diagnostics: validation.diagnostics.map((diagnostic) => compilerDiagnostic(projectPath, diagnostic)),
        projectPath,
        status: "fail",
      };
    }

    return {
      bundlePath: resolve(projectPath, config.outDir),
      code: "TN_DEV_WATCH_REBUILD_OK",
      diagnostics: [
        {
          code: "TN_DEV_WATCH_REBUILD_OK",
          file: resolve(projectPath, config.entry),
          message: `Rebuilt bundle at '${build.bundlePath}'.`,
          severity: "info",
        },
      ],
      projectPath,
      status: "pass",
    };
  } catch (error) {
    const diagnostics =
      error instanceof CompilerError && error.diagnostic !== undefined
        ? [compilerDiagnostic(projectPath, error.diagnostic)]
        : [
            {
              code: "TN_DEV_WATCH_BUILD_FAILED",
              file: resolve(projectPath, "threenative.config.json"),
              message: error instanceof Error ? error.message : String(error),
              severity: "error" as const,
              suggestedFix: "Fix the reported source or config error and save again.",
            },
          ];
    return {
      code: "TN_DEV_WATCH_REBUILD_FAILED",
      diagnostics,
      projectPath,
      status: "fail",
    };
  }
}

function compilerDiagnostic(projectPath: string, diagnostic: ICompilerDiagnostic): IWatchDiagnostic {
  return {
    code: diagnostic.code,
    file: diagnostic.file ?? resolve(projectPath, diagnostic.path),
    message: diagnostic.message,
    severity: diagnostic.severity === "warning" ? "info" : "error",
    suggestedFix: diagnostic.suggestion ?? "Update the emitted IR source so the bundle validates.",
  };
}

async function collectWatchedPaths(projectPath: string): Promise<string[]> {
  const candidates = [resolve(projectPath, "threenative.config.json"), resolve(projectPath, "src"), resolve(projectPath, "assets")];
  const existing = await Promise.all(
    candidates.map(
      (path) =>
        new Promise<string | undefined>((resolvePath) => {
          access(path, (error) => resolvePath(error === null ? path : undefined));
        }),
    ),
  );
  return existing.filter((path): path is string => path !== undefined);
}
