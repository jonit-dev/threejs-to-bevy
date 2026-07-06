import { createServer, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { type AddressInfo } from "node:net";

import { chromium } from "playwright";

import { comparePngMovement, readPngComposition, visualDiagnostics } from "./metrics.js";
import { type IBenchmarkDiagnostic } from "./types.js";

export interface ICaptureResult {
  artifacts: {
    afterScreenshot?: string;
    beforeScreenshot?: string;
  };
  diagnostics: IBenchmarkDiagnostic[];
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

export async function captureCandidate(options: { candidate: string; outDir: string; url?: string }): Promise<ICaptureResult> {
  await mkdir(options.outDir, { recursive: true });
  let preview: IPreviewHandle | undefined;
  const beforeScreenshot = resolve(options.outDir, "before.png");
  const afterScreenshot = resolve(options.outDir, "after.png");
  const diagnostics: IBenchmarkDiagnostic[] = [];
  try {
    preview = options.url === undefined ? await launchCandidatePreview(options.candidate) : { close: async () => undefined, url: options.url };
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
      const browserLogs: string[] = [];
      page.on("console", (message) => browserLogs.push(`${message.type()}: ${message.text()}`));
      await page.goto(preview.url, { waitUntil: "domcontentloaded" });
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
      await page.screenshot({ fullPage: false, path: beforeScreenshot });
      for (const key of ["ArrowRight", "KeyD", "ArrowUp", "KeyW"]) {
        await page.keyboard.down(key);
      }
      await page.waitForTimeout(700);
      for (const key of ["ArrowRight", "KeyD", "ArrowUp", "KeyW"].reverse()) {
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
      return {
        artifacts: { afterScreenshot, beforeScreenshot },
        diagnostics,
        metrics: { after, before, movementDelta },
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

async function launchCandidatePreview(candidate: string): Promise<IPreviewHandle> {
  if (await pathExists(resolve(candidate, "index.html"))) {
    return launchStaticServer(candidate);
  }
  if (await pathExists(resolve(candidate, "threenative.config.json"))) {
    return launchThreeNativePreview(candidate);
  }
  const packageJsonPath = resolve(candidate, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    throw new Error("Candidate must include index.html or package.json with a dev/start script.");
  }
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
  const script = packageJson.scripts?.["dev:web"] !== undefined ? "dev:web" : packageJson.scripts?.dev === undefined ? "start" : "dev";
  if (packageJson.scripts?.[script] === undefined) {
    throw new Error("Candidate package.json must define a dev or start script.");
  }
  if (script === "dev:web") {
    return launchJsonUrlScript(candidate, script);
  }
  const port = await reservePort();
  const child = spawn("pnpm", ["run", script, "--", "--host", "127.0.0.1", "--port", String(port)], {
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
  const child = spawn("pnpm", ["tn", "--", "dev", "--project", candidate, "--target", "web", "--json"], {
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
    const pathname = decodeURIComponent(rawUrl.split("?")[0] ?? "/index.html");
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
