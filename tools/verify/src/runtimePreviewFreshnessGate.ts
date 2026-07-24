import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";

import type { VerificationDiagnostic } from "./runner.js";

export interface RuntimePreviewFreshnessEvidence {
  executedRuntimeBuildHash: string | null;
  initialRuntimeBuildHash: string;
  reloadCount: number;
  runtimeBuildHash: string;
  runtimeVersion: string;
}

export function validateRuntimePreviewFreshness(evidence: RuntimePreviewFreshnessEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (evidence.runtimeBuildHash === evidence.initialRuntimeBuildHash) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_PREVIEW_HASH_UNCHANGED", "The runtime source edit did not change the served runtime build hash."));
  }
  if (evidence.executedRuntimeBuildHash !== evidence.runtimeBuildHash) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_PREVIEW_EXECUTED_STALE", "The browser did not report execution of the current runtime build."));
  }
  if (evidence.runtimeVersion !== "two" || evidence.reloadCount !== 2) {
    diagnostics.push(failure("TN_VERIFY_RUNTIME_PREVIEW_RELOAD_COUNT", `Expected exactly one rebuild reload into runtime 'two'; observed version '${evidence.runtimeVersion}' after ${evidence.reloadCount} page loads.`));
  }
  return diagnostics;
}

export async function runRuntimePreviewFreshnessGate(options: { reportPath?: string; root?: string } = {}): Promise<{
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/runtime-preview-freshness/verification-report.json");
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "tn-runtime-freshness-"));
  let preview: Awaited<ReturnType<typeof startWebPreview>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await mkdir(resolve(runtimeRoot, "src/browser"), { recursive: true });
    await writeFile(resolve(runtimeRoot, "index.html"), '<body><script id="threenative-runtime-entry"></script></body>\n');
    const entryPath = resolve(runtimeRoot, "src/browser/main.ts");
    await writeFile(entryPath, runtimeSource("one"));
    preview = await startWebPreview({
      bundlePath: resolve(root, "packages/ir/fixtures/cube-scene/game.bundle"),
      port: 0,
      runtimeRoot,
      silent: true,
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(preview.url);
    await page.waitForFunction('document.body.dataset.runtimeVersion === "one"');
    const initial = await readDevState(preview.url);

    await writeFile(entryPath, runtimeSource("two"));
    await page.waitForFunction('document.body.dataset.runtimeVersion === "two"');
    await page.waitForTimeout(500);
    const current = await readDevState(preview.url);
    const evidence: RuntimePreviewFreshnessEvidence = {
      executedRuntimeBuildHash: current.executedRuntimeBuildHash,
      initialRuntimeBuildHash: initial.runtimeBuildHash,
      reloadCount: await page.evaluate('Number(sessionStorage.getItem("runtime-loads") ?? "0")') as number,
      runtimeBuildHash: current.runtimeBuildHash,
      runtimeVersion: await page.evaluate('document.body.dataset.runtimeVersion ?? ""') as string,
    };
    const diagnostics = validateRuntimePreviewFreshness(evidence);
    const ok = diagnostics.length === 0;
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify({
      code: ok ? "TN_VERIFY_RUNTIME_PREVIEW_FRESHNESS_OK" : "TN_VERIFY_RUNTIME_PREVIEW_FRESHNESS_FAILED",
      diagnostics,
      evidence,
      ok,
      schema: "threenative.verify.runtime-preview-freshness",
      status: ok ? "pass" : "fail",
      version: "0.1.0",
    }, null, 2)}\n`, "utf8");
    return { diagnostics, ok, reportPath };
  } finally {
    await browser?.close();
    await preview?.close();
    await rm(runtimeRoot, { force: true, recursive: true });
  }
}

function runtimeSource(version: string): string {
  return `const loads = Number(sessionStorage.getItem("runtime-loads") ?? "0") + 1;\n`
    + `sessionStorage.setItem("runtime-loads", String(loads));\n`
    + `document.body.dataset.runtimeVersion = ${JSON.stringify(version)};\n`;
}

async function readDevState(url: string): Promise<{ executedRuntimeBuildHash: string | null; runtimeBuildHash: string }> {
  const response = await fetch(new URL("/__threenative/dev-state.json", url));
  if (!response.ok) {
    throw new Error(`Dev-state request failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return await response.json() as { executedRuntimeBuildHash: string | null; runtimeBuildHash: string };
}

function failure(code: string, message: string): VerificationDiagnostic {
  return { code, message, severity: "error", suggestedFix: "Keep the preview entry under Vite ownership and report the hash only after the current runtime module executes." };
}

if (process.argv[1]?.endsWith("runtimePreviewFreshnessGate.js")) {
  const result = await runRuntimePreviewFreshnessGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
