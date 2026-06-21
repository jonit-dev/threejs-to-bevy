import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { stopProcess, type VerificationReport } from "./runner.js";

export interface IEditorPackageArtifacts extends Record<string, unknown> {
  report: string;
  screenshot: string;
}

export function editorPackageArtifactPaths(root = process.cwd()): IEditorPackageArtifacts {
  const artifactRoot = resolve(root, "tools/verify/artifacts/editor-package");
  return {
    report: resolve(artifactRoot, "editor-package-report.json"),
    screenshot: resolve(artifactRoot, "editor-package-smoke.png"),
  };
}

export async function runEditorPackageGate(root = process.cwd()): Promise<VerificationReport<IEditorPackageArtifacts>> {
  const artifacts = editorPackageArtifactPaths(root);
  await mkdir(resolve(root, "tools/verify/artifacts/editor-package"), { recursive: true });
  const url = "http://127.0.0.1:5199";
  const server = spawn("pnpm", ["--dir", resolve(root, "packages/editor"), "exec", "vite", "--host", "127.0.0.1", "--port", "5199"], {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "ignore"],
  });
  const startedAt = new Date().toISOString();
  const steps = [];
  const diagnostics = [];
  let ok = false;
  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { height: 900, width: 1280 } });
      await waitForHttp(url, 30_000);
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      for (const text of ["ThreeNative Editor", "Hierarchy", "Inspector", "Assets", "Diagnostics", "Preview", "arena.scene.json"]) {
        await page.getByText(text).first().waitFor({ timeout: 10_000 });
      }
      await page.screenshot({ path: artifacts.screenshot, fullPage: true });
      ok = true;
      steps.push({ durationMs: 0, exitCode: 0, name: "browser-smoke", stderr: "", stdout: "Editor shell and preview status rendered." });
    } finally {
      await browser.close();
    }
  } catch (error) {
    diagnostics.push({
      code: "TN_VERIFY_EDITOR_PACKAGE_SMOKE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      severity: "error" as const,
      suggestedFix: "Run pnpm --filter @threenative/editor dev and inspect the browser console.",
    });
    steps.push({ durationMs: 0, exitCode: 1, name: "browser-smoke", stderr: String(error), stdout: "" });
  } finally {
    stopProcess(server);
  }

  const report: VerificationReport<IEditorPackageArtifacts> = {
    artifacts,
    code: "TN_VERIFY_EDITOR_PACKAGE",
    diagnostics,
    generatedBy: "tools/verify/editorPackage",
    ok,
    schema: "threenative.verification-report",
    startedAt,
    status: ok ? "pass" : "fail",
    steps,
    version: "0.1.0",
  };
  await writeFile(artifacts.report, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runEditorPackageGate();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}
