import { createServer, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { type AddressInfo } from "node:net";

import { chromium } from "playwright";

import { comparePngMovement, readPngComposition, visualDiagnostics } from "./metrics.js";
import { captureBrowserObservation, validateObservationRoute } from "./browser-observation.js";
import { preparedObservationRouteText } from "./prepare.js";
import { BENCHMARK_OBSERVATION_PROTOCOL_VERSION } from "./proof-contract.js";
import { type IBenchmarkBrowserObservationTrace, type IBenchmarkDiagnostic } from "./types.js";

export interface ICaptureResult {
  artifacts: {
    afterScreenshot?: string;
    beforeScreenshot?: string;
    observationTrace?: string;
  };
  diagnostics: IBenchmarkDiagnostic[];
  observationTrace?: IBenchmarkBrowserObservationTrace;
  metrics?: {
    after: Awaited<ReturnType<typeof readPngComposition>>;
    before: Awaited<ReturnType<typeof readPngComposition>>;
    movementDelta: Awaited<ReturnType<typeof comparePngMovement>>;
  };
}

interface IPreviewHandle {
  close: () => Promise<void>;
  url: string;
}

const REPOSITORY_THREE_VERSION = "0.181.2";

export async function captureCandidate(options: { candidate: string; condition?: "threenative" | "typed-spec" | "vanilla"; expectedPromptSha256?: string; observePromptId?: string; outDir: string; url?: string }): Promise<ICaptureResult> {
  await mkdir(options.outDir, { recursive: true });
  let preview: IPreviewHandle | undefined;
  const beforeScreenshot = resolve(options.outDir, "before.png");
  const afterScreenshot = resolve(options.outDir, "after.png");
  const diagnostics: IBenchmarkDiagnostic[] = [];
  try {
    if (options.expectedPromptSha256 !== undefined) diagnostics.push(...await promptHashDiagnostics(options.candidate, options.expectedPromptSha256));
    if (options.condition === "vanilla") diagnostics.push(...await vanillaThreeComplianceDiagnostics(options.candidate));
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return { artifacts: {}, diagnostics };
    preview = options.url === undefined ? await launchCandidatePreview(options.candidate) : { close: async () => undefined, url: options.url };
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
      const browserLogs: string[] = [];
      page.on("console", (message) => browserLogs.push(`${message.type()}: ${message.text()}`));
      await page.goto(withBenchmarkAutostart(preview.url), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(750);
      const canvas = await page.$("canvas");
      if (canvas === null) {
        diagnostics.push({
          code: "TN_BENCH_NO_CANVAS",
          message: "No canvas element was found in the candidate page.",
          severity: "error",
          suggestedFix: "The benchmark candidate must render gameplay to a canvas.",
        });
        return { artifacts: {}, diagnostics };
      }
      if (options.condition === "vanilla") {
        const webgl = await canvas.evaluate((element) => {
          const candidate = element as unknown as { getContext(type: string): unknown };
          return candidate.getContext("webgl2") !== null || candidate.getContext("webgl") !== null;
        });
        if (!webgl) {
          diagnostics.push({ code: "TN_BENCH_VANILLA_WEBGL_REQUIRED", message: "Vanilla candidate canvas does not expose a WebGL context.", severity: "error", suggestedFix: "Render active play with the declared Three.js WebGLRenderer instead of DOM or 2D canvas drawing." });
          return { artifacts: {}, diagnostics };
        }
        const rendererState = await canvas.evaluate((element) => {
          const renderer = (globalThis as unknown as Record<string, unknown>).__THREE_BENCHMARK_RENDERER__;
          const candidate = renderer as { domElement?: unknown; getContext?: () => { canvas?: unknown }; info?: { render?: { calls?: unknown } }; isWebGLRenderer?: unknown; render?: unknown };
          const context = typeof candidate.getContext === "function" ? candidate.getContext() : undefined;
          return {
            canvasOwned: candidate.domElement === element && context?.canvas === element,
            renderCalls: typeof candidate.info?.render?.calls === "number" ? candidate.info.render.calls : -1,
            rendererShape: candidate.isWebGLRenderer === true && typeof candidate.render === "function",
          };
        });
        if (!rendererState.rendererShape) {
          diagnostics.push({ code: "TN_BENCH_VANILLA_RENDERER_REQUIRED", message: "globalThis.__THREE_BENCHMARK_RENDERER__ is not an active THREE.WebGLRenderer.", severity: "error", suggestedFix: "Expose the actual THREE.WebGLRenderer instance used by active play, not a renderer-shaped wrapper." });
          return { artifacts: {}, diagnostics };
        }
        if (!rendererState.canvasOwned) {
          diagnostics.push({
            code: "TN_BENCH_VANILLA_RENDERER_CANVAS_MISMATCH",
            message: "The scored canvas is not the active canvas owned by globalThis.__THREE_BENCHMARK_RENDERER__.",
            severity: "error",
            suggestedFix: "Expose the active THREE.WebGLRenderer as globalThis.__THREE_BENCHMARK_RENDERER__ and append that renderer's domElement as the scored gameplay canvas.",
          });
          return { artifacts: {}, diagnostics };
        }
        if (rendererState.renderCalls <= 0) {
          diagnostics.push({ code: "TN_BENCH_VANILLA_RENDERER_INACTIVE", message: "The exposed THREE.WebGLRenderer has not completed a render call on the scored canvas.", severity: "error", suggestedFix: "Fix browser runtime exceptions and ensure the animation loop calls renderer.render(scene, camera) before scoring." });
          return { artifacts: {}, diagnostics };
        }
      }
      await activateCandidate(page, false);
      await page.screenshot({ fullPage: false, path: beforeScreenshot });
      const probeKeys = ["ArrowRight", "KeyD", "ArrowUp", "KeyW", "Space", "Enter"];
      for (const key of probeKeys) {
        await page.keyboard.down(key);
      }
      await page.waitForTimeout(700);
      for (const key of [...probeKeys].reverse()) {
        await page.keyboard.up(key);
      }
      await page.screenshot({ fullPage: false, path: afterScreenshot });
      const before = await readPngComposition(beforeScreenshot);
      const after = await readPngComposition(afterScreenshot);
      const movementDelta = await comparePngMovement(beforeScreenshot, afterScreenshot);
      diagnostics.push(...visualDiagnostics(before));
      if (movementDelta.changedPixelRatio < movementDelta.threshold) {
        diagnostics.push({
          code: "TN_BENCH_NO_MOVEMENT",
          message: `Keyboard probe changed ${(movementDelta.changedPixelRatio * 100).toFixed(3)}% of pixels, below ${(movementDelta.threshold * 100).toFixed(3)}%.`,
          severity: "error",
          suggestedFix: "Wire keyboard input so a visible actor moves under WASD or arrow keys.",
        });
      }
      if (browserLogs.length > 0) {
        diagnostics.push({ code: "TN_BENCH_BROWSER_LOGS", message: `Browser emitted ${browserLogs.length} console log(s).`, severity: "warning" });
      }
      if (options.observePromptId !== undefined) {
        await page.clock.install();
        const pageNow = await page.evaluate(() => Date.now());
        await page.clock.pauseAt(pageNow + 1_000);
      }
      const observation = options.observePromptId === undefined
        ? undefined
        : await capturePreparedObservationRoutes({ candidate: options.candidate, outDir: options.outDir, page, promptId: options.observePromptId, url: withBenchmarkAutostart(preview.url) });
      if (observation !== undefined) diagnostics.push(...observation.diagnostics);
      return {
        artifacts: { afterScreenshot, beforeScreenshot, ...(observation?.path === undefined ? {} : { observationTrace: observation.path }) },
        diagnostics,
        metrics: { after, before, movementDelta },
        ...(observation === undefined ? {} : { observationTrace: observation.trace }),
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    diagnostics.push({
      code: "TN_BENCH_CAPTURE_FAILED",
      message: `Benchmark capture failed: ${error instanceof Error ? error.message : String(error)}.`,
      severity: "error",
    });
    return { artifacts: {}, diagnostics };
  } finally {
    await preview?.close();
  }
}

async function capturePreparedObservationRoutes(options: { candidate: string; outDir: string; page: import("playwright").Page; promptId: string; url: string }): Promise<{ diagnostics: IBenchmarkDiagnostic[]; path?: string; trace: IBenchmarkBrowserObservationTrace }> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const value = await readFile(resolve(options.candidate, "benchmark-observation-route.json"), "utf8")
    .then((text) => JSON.parse(text) as unknown)
    .catch(() => undefined);
  if (!isRecord(value) || value.schema !== "threenative.agent-benchmark-observation-route" || value.version !== 1 || value.promptId !== options.promptId || !Array.isArray(value.routes)) {
    diagnostics.push({ code: "TN_BENCH_OBSERVATION_ROUTE_MISSING", message: `${options.promptId} is missing a valid benchmark-observation-route.json.`, severity: "error", suggestedFix: "Restore the prepared scorer-owned observation route." });
    return { diagnostics, trace: emptyObservationTrace(options.promptId) };
  }
  const expected = JSON.parse(preparedObservationRouteText(options.promptId)) as unknown;
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    diagnostics.push({ code: "TN_BENCH_OBSERVATION_ROUTE_DRIFT", message: `${options.promptId} changed the prepared scorer-owned observation route.`, severity: "error", suggestedFix: "Restore the prepared route exactly; implement its raw state transitions in the playable game instead of changing scorer inputs." });
    return { diagnostics, trace: emptyObservationTrace(options.promptId) };
  }
  const routes = [];
  for (const routeValue of value.routes) {
    const validated = validateObservationRoute(routeValue, options.promptId);
    diagnostics.push(...validated.diagnostics);
    if (validated.route === undefined) continue;
    await options.page.goto(options.url, { waitUntil: "domcontentloaded" });
    await advancePageTime(options.page, 750);
    await activateCandidate(options.page, true);
    const currentCanvas = options.page.locator("canvas").first();
    const captured = await captureBrowserObservation({ canvas: currentCanvas, outDir: resolve(options.outDir, "observations"), page: options.page, promptId: options.promptId, route: validated.route });
    diagnostics.push(...captured.diagnostics);
    routes.push(...captured.trace.routes);
  }
  const trace: IBenchmarkBrowserObservationTrace = { ...emptyObservationTrace(options.promptId), routes };
  const path = resolve(options.outDir, "browser-observation-trace.json");
  await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return { diagnostics, path, trace };
}

function emptyObservationTrace(promptId: string): IBenchmarkBrowserObservationTrace {
  return { observationProtocolVersion: BENCHMARK_OBSERVATION_PROTOCOL_VERSION, promptId, routes: [], schema: "threenative.agent-benchmark-observation-trace", version: 1 };
}

async function activateCandidate(page: import("playwright").Page, virtualTime: boolean): Promise<void> {
  const startButton = page.getByRole("button", { name: /^(?:start|play|begin|launch)\b/iu }).filter({ visible: true }).first();
  if (await startButton.count() > 0) await startButton.click();
  else await page.mouse.click(640, 360);
  if (virtualTime) await advancePageTime(page, 100);
  else await page.waitForTimeout(100);
}

async function advancePageTime(page: import("playwright").Page, durationMs: number): Promise<void> {
  await page.clock.runFor(durationMs);
}

async function promptHashDiagnostics(candidate: string, expected: string): Promise<IBenchmarkDiagnostic[]> {
  const prompt = await readFile(resolve(candidate, "benchmark-prompt.txt")).catch(() => undefined);
  if (prompt === undefined) return [{ code: "TN_BENCH_PROMPT_CONTENT_DRIFT", message: "Prepared candidate is missing benchmark-prompt.txt.", severity: "error" }];
  const { createHash } = await import("node:crypto");
  const actual = createHash("sha256").update(prompt).digest("hex");
  return actual === expected ? [] : [{ code: "TN_BENCH_PROMPT_CONTENT_DRIFT", message: `Candidate prompt SHA-256 ${actual} does not match prepared hash ${expected}.`, severity: "error" }];
}

async function vanillaThreeComplianceDiagnostics(candidate: string): Promise<IBenchmarkDiagnostic[]> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const packageValue = await readFile(resolve(candidate, "package.json"), "utf8").then((text) => JSON.parse(text) as unknown).catch(() => undefined);
  const dependency = isRecord(packageValue) && isRecord(packageValue.dependencies) ? packageValue.dependencies.three : undefined;
  if (!isRepositoryThreeDependency(dependency)) diagnostics.push({ code: "TN_BENCH_VANILLA_THREE_DEPENDENCY_INVALID", message: `Vanilla candidate must declare three '${REPOSITORY_THREE_VERSION}' or '^${REPOSITORY_THREE_VERSION}' in dependencies.`, severity: "error" });
  const entries = await readdir(candidate, { recursive: true, withFileTypes: true }).catch(() => []);
  const sourcePaths = entries.filter((entry) => {
    const relativeParent = relative(candidate, entry.parentPath);
    return entry.isFile()
      && /\.(?:html|js|mjs|ts)$/u.test(entry.name)
      && !relativeParent.split(/[\\/]/u).some((part) => part === "node_modules" || part === "artifacts");
  }).map((entry) => resolve(entry.parentPath, entry.name));
  const sources = (await Promise.all(sourcePaths.map((path) => readFile(path, "utf8").catch(() => "")))).join("\n");
  if (!/import\s+\*\s+as\s+THREE\s+from\s+["']three["']/u.test(sources)) diagnostics.push({ code: "TN_BENCH_VANILLA_THREE_IMPORT_MISSING", message: "Vanilla candidate must import the declared dependency as THREE from 'three'.", severity: "error" });
  if (!/new\s+THREE\.WebGLRenderer\s*\(/u.test(sources)) diagnostics.push({ code: "TN_BENCH_VANILLA_WEBGL_RENDERER_MISSING", message: "Vanilla candidate must construct THREE.WebGLRenderer for active play.", severity: "error" });
  return diagnostics;
}

function isRepositoryThreeDependency(value: unknown): value is string {
  return value === REPOSITORY_THREE_VERSION || value === `^${REPOSITORY_THREE_VERSION}`;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function withBenchmarkAutostart(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("tn-benchmark-autostart", "1");
  return parsed.toString();
}

async function launchCandidatePreview(candidate: string): Promise<IPreviewHandle> {
  const packageJsonPath = resolve(candidate, "package.json");
  if (await pathExists(packageJsonPath)) {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
    const script = packageJson.scripts?.["dev:web"] !== undefined ? "dev:web" : packageJson.scripts?.dev !== undefined ? "dev" : packageJson.scripts?.start !== undefined ? "start" : undefined;
    if (script !== undefined) {
      if (script === "dev:web") return launchJsonUrlScript(candidate, script);
      const port = await reservePort();
      const child = spawn("pnpm", ["run", script, "--host", "127.0.0.1", "--port", String(port)], {
        cwd: candidate,
        stdio: "ignore",
      });
      await waitForHttp(`http://127.0.0.1:${port}`);
      return {
        close: async () => {
          await terminate(child);
        },
        url: `http://127.0.0.1:${port}`,
      };
    }
  }
  if (await pathExists(resolve(candidate, "index.html"))) {
    return launchStaticServer(candidate);
  }
  if (await pathExists(resolve(candidate, "threenative.config.json"))) {
    return launchThreeNativePreview(candidate);
  }
  throw new Error("Candidate must include index.html or package.json with a dev/start script.");
}

async function launchJsonUrlScript(candidate: string, script: string): Promise<IPreviewHandle> {
  const child = spawn("pnpm", ["run", script, "--", "--json"], {
    cwd: candidate,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const url = parseJsonPreviewUrl(stdout);
    if (url !== undefined) {
      await waitForHttp(url);
      return {
        close: async () => {
          await terminate(child);
        },
        url,
      };
    }
    if (child.exitCode !== null) {
      throw new Error(`Preview command exited before reporting a URL: ${stderr || stdout || `exit ${child.exitCode}`}`);
    }
    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 100));
  }
  await terminate(child);
  throw new Error(`Timed out waiting for preview URL from '${script}': ${stderr || stdout || "no output"}`);
}

async function launchThreeNativePreview(candidate: string): Promise<IPreviewHandle> {
  const workspaceRoot = await findWorkspaceRoot(candidate);
  const child = spawn(process.execPath, [resolve(workspaceRoot, "packages/cli/dist/index.js"), "dev", "--project", candidate, "--target", "web", "--json"], {
    cwd: workspaceRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return waitForJsonPreviewUrl(child, "tn dev --target web");
}

async function waitForJsonPreviewUrl(child: ChildProcess, label: string): Promise<IPreviewHandle> {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const url = parseJsonPreviewUrl(stdout);
    if (url !== undefined) {
      await waitForHttp(url);
      return {
        close: async () => {
          await terminate(child);
        },
        url,
      };
    }
    if (child.exitCode !== null) {
      throw new Error(`Preview command exited before reporting a URL: ${stderr || stdout || `exit ${child.exitCode}`}`);
    }
    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 100));
  }
  await terminate(child);
  throw new Error(`Timed out waiting for preview URL from '${label}': ${stderr || stdout || "no output"}`);
}

async function launchStaticServer(root: string): Promise<IPreviewHandle> {
  const server = createServer(async (request, response) => {
    const rawUrl = request.url === undefined || request.url === "/" ? "/index.html" : request.url;
    const rawPathname = decodeURIComponent(rawUrl.split("?")[0] ?? "/index.html");
    const pathname = rawPathname === "/" ? "/index.html" : rawPathname;
    const filePath = resolve(root, `.${pathname}`);
    if (!filePath.startsWith(resolve(root))) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "content-type": contentType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address() as AddressInfo;
  return {
    close: () => closeServer(server),
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address() as AddressInfo;
  await closeServer(server);
  return address.port;
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return;
      }
    } catch {
      await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 250));
    }
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveExit();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => server.close((error) => error === undefined ? resolveClose() : reject(error)));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findWorkspaceRoot(start: string): Promise<string> {
  let current = resolve(start);
  while (true) {
    if (await pathExists(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(start);
    }
    current = parent;
  }
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function parseJsonPreviewUrl(stdout: string): string | undefined {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1)) as { url?: unknown };
    return typeof parsed.url === "string" ? parsed.url : undefined;
  } catch {
    return undefined;
  }
}
