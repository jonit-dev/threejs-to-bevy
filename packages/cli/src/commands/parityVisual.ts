import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { loadProjectConfig } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { readPngFrame } from "../verify/compareImages.js";
import { compareImagesCommand } from "./compareImages.js";
import { screenshotCommand } from "./visualProof.js";

export interface IParityVisualOptions {
  compareRunner?: (argv: readonly string[], cwd: string) => Promise<ICommandResult>;
  fetcher?: typeof fetch;
  screenshotRunner?: (argv: readonly string[], cwd: string) => Promise<ICommandResult>;
}

interface IVisualParityHistoryEntry {
  screenshotPath: string;
  similarity: number;
  timestamp: string;
}

const usage = "tn parity visual --project <path> --url <preview-url> --reference <png> [--out <png>] [--history <json>] [--viewport reference|desktop|mobile|<width>x<height>] [--json]";

export async function parityVisualCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IParityVisualOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const commandArgv = normalizedArgv[0] === "visual" ? normalizedArgv.slice(1) : normalizedArgv;
  const json = commandArgv.includes("--json");
  const url = readFlag(commandArgv, "--url");
  const referenceArg = readFlag(commandArgv, "--reference");
  if (url === undefined || referenceArg === undefined) {
    return diagnosticResult(
      { code: "TN_PARITY_VISUAL_USAGE", message: usage },
      { exitCode: 2, json, stderr: !json },
    );
  }

  const projectPath = resolve(cwd, readFlag(commandArgv, "--project") ?? ".");
  const screenshotArg = readFlag(commandArgv, "--out") ?? "artifacts/visual-parity/current.png";
  const historyArg = readFlag(commandArgv, "--history") ?? "artifacts/visual-parity/history.json";
  const screenshotPath = resolve(projectPath, screenshotArg);
  const historyPath = resolve(projectPath, historyArg);
  const referencePath = resolve(projectPath, referenceArg);

  try {
    const config = await loadProjectConfig(projectPath);
    const manifestPath = resolve(projectPath, config.outDir, "manifest.json");
    const manifest = await readFile(manifestPath);
    const localBundleHash = createHash("sha256").update(manifest).digest("hex");
    const previewState = await readPreviewState(url, options.fetcher ?? fetch);
    if (previewState.bundleHash !== localBundleHash || previewState.sourceBuildStatus === "stale") {
      return visualFailure("TN_PARITY_VISUAL_PREVIEW_STALE", "The preview is serving a stale bundle. Rebuild and restart 'tn dev --target web' before measuring parity.", json);
    }

    const newerSource = await findNewerSource(projectPath, (await stat(manifestPath)).mtimeMs);
    if (newerSource !== undefined) {
      return visualFailure(
        "TN_PARITY_VISUAL_SOURCE_STALE",
        `Durable source '${newerSource}' is newer than the built bundle. Rebuild and restart 'tn dev --target web' before measuring parity.`,
        json,
        newerSource,
      );
    }

    const viewportArg = readFlag(commandArgv, "--viewport") ?? "reference";
    const viewport = viewportArg === "reference"
      ? await referenceViewport(referencePath)
      : viewportArg;
    const screenshotResult = await (options.screenshotRunner ?? screenshotCommand)([
      "--project",
      projectPath,
      "--url",
      url,
      "--out",
      screenshotPath,
      "--viewport",
      viewport,
      "--wait-ready",
      "--json",
    ], cwd);
    if (screenshotResult.exitCode !== 0) {
      return visualFailure("TN_PARITY_VISUAL_SCREENSHOT_FAILED", childFailureMessage(screenshotResult, "Screenshot capture failed."), json);
    }

    const comparisonResult = await (options.compareRunner ?? compareImagesCommand)([
      screenshotPath,
      referencePath,
      "--json",
    ], cwd);
    if (comparisonResult.exitCode !== 0) {
      return visualFailure("TN_PARITY_VISUAL_COMPARE_FAILED", childFailureMessage(comparisonResult, "Image comparison failed."), json);
    }
    const comparison = parseJsonObject(comparisonResult.stdout);
    const similarity = similarityFromComparison(comparison);
    const history = await readHistory(historyPath);
    const entry: IVisualParityHistoryEntry = {
      screenshotPath: relative(projectPath, screenshotPath),
      similarity,
      timestamp: new Date().toISOString(),
    };
    history.push(entry);
    await mkdir(dirname(historyPath), { recursive: true });
    await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");

    const payload = {
      artifacts: {
        history: historyPath,
        reference: referencePath,
        screenshot: screenshotPath,
      },
      bundleHash: localBundleHash,
      code: "TN_PARITY_VISUAL_OK",
      comparison,
      pass: true,
      projectPath,
      similarity,
      url,
      viewport,
    };
    return {
      exitCode: 0,
      stdout: json
        ? `${JSON.stringify(payload, null, 2)}\n`
        : `Visual parity similarity: ${similarity.toFixed(6)}\nScreenshot: ${screenshotPath}\nHistory: ${historyPath}\n`,
    };
  } catch (error) {
    return visualFailure(
      "TN_PARITY_VISUAL_FAILED",
      error instanceof Error ? error.message : String(error),
      json,
    );
  }
}

async function readPreviewState(url: string, fetcher: typeof fetch): Promise<{ bundleHash: string; sourceBuildStatus?: string }> {
  let response: Response;
  try {
    response = await fetcher(new URL("/__threenative/dev-state.json", url));
  } catch {
    throw new Error(`No ThreeNative dev server is reachable at '${url}'. Start it with 'tn dev --target web'.`);
  }
  if (!response.ok) {
    throw new Error(`Dev-state request failed with HTTP ${response.status}. Restart 'tn dev --target web'.`);
  }
  const parsed = await response.json() as unknown;
  if (!isRecord(parsed) || typeof parsed.bundleHash !== "string") {
    throw new Error("The preview dev-state response did not contain a bundleHash.");
  }
  return {
    bundleHash: parsed.bundleHash,
    ...(typeof parsed.sourceBuildStatus === "string" ? { sourceBuildStatus: parsed.sourceBuildStatus } : {}),
  };
}

async function findNewerSource(projectPath: string, manifestModifiedAt: number): Promise<string | undefined> {
  const pending = ["content", "src", "overlay", "assets"].map((path) => resolve(projectPath, path));
  const configPath = resolve(projectPath, "threenative.config.json");
  if ((await stat(configPath)).mtimeMs > manifestModifiedAt) {
    return "threenative.config.json";
  }
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) continue;
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && (await stat(path)).mtimeMs > manifestModifiedAt) {
        return relative(projectPath, path);
      }
    }
  }
  return undefined;
}

async function referenceViewport(referencePath: string): Promise<string> {
  const frame = await readPngFrame(referencePath);
  return `${frame.width}x${frame.height}`;
}

function similarityFromComparison(comparison: Record<string, unknown>): number {
  const deltas = comparison.averageColorDelta;
  if (
    !isRecord(deltas)
    || !Number.isFinite(deltas.red)
    || !Number.isFinite(deltas.green)
    || !Number.isFinite(deltas.blue)
  ) {
    throw new Error("'tn compare-images' did not return numeric averageColorDelta values.");
  }
  const similarity = Math.max(0, Math.min(1, 1 - ((deltas.red as number) + (deltas.green as number) + (deltas.blue as number)) / 3));
  return Number(similarity.toFixed(6));
}

async function readHistory(path: string): Promise<IVisualParityHistoryEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("history must be a JSON array");
    }
    return parsed as IVisualParityHistoryEntry[];
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return [];
    throw new Error(`Could not read parity history '${path}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

function childFailureMessage(result: ICommandResult, fallback: string): string {
  const parsed = parseJsonObject(result.stdout);
  const diagnostics = parsed.diagnostics;
  if (Array.isArray(diagnostics) && isRecord(diagnostics[0]) && typeof diagnostics[0].message === "string") {
    return diagnostics[0].message;
  }
  return result.stderr?.trim() || result.stdout.trim() || fallback;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed)) throw new Error("Expected a JSON object.");
  return parsed;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function visualFailure(code: string, message: string, json: boolean, path?: string): ICommandResult {
  return diagnosticResult(
    { code, message, ...(path === undefined ? {} : { path }) },
    { exitCode: 1, json, stderr: !json },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
