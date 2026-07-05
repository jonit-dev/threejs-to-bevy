import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { chromium } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { analyzeGameScaleEntities, type IGameScaleEntityInput } from "../verify/gameScale.js";
import { readFlag, resolveProjectPath } from "./gameShared.js";

export async function gameScaleCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  const out = readFlag(normalizedArgv, "--out") ?? "artifacts/game-production/scale-analysis.json";
  const outPath = isAbsolute(out) ? out : resolve(projectPath, out);
  let server: IWebPreviewServer | undefined;

  try {
    let previewUrl = readFlag(normalizedArgv, "--url");
    if (previewUrl === undefined) {
      const config = await loadProjectConfig(projectPath);
      const build = await buildProject(projectPath);
      const report = await validateBundle(build.bundlePath);
      if (!report.ok) {
        throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
      }
      server = await startWebPreview({ bundlePath: resolve(projectPath, config.outDir), silent: true });
      previewUrl = server.url;
    }

    const renderedEntities = await readRenderedEntitiesFromPreview(previewUrl);
    const analysis = analyzeGameScaleEntities(renderedEntities);
    const artifact = {
      schema: "threenative.game-scale-analysis",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      source: "tn game scale",
      previewUrl,
      ...analysis,
      notes: "Runtime scale analysis uses loaded rendered-entity world bounds. It catches obvious relative-scale mistakes such as a player reading as tall as a train.",
    };
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    const payload = {
      code: analysis.ok ? "TN_GAME_SCALE_OK" : "TN_GAME_SCALE_FAILED",
      artifactPath: outPath,
      message: analysis.ok ? "Runtime scale analysis passed." : "Runtime scale analysis found incoherent relative scale.",
      ...artifact,
    };
    return {
      exitCode: analysis.ok ? 0 : 1,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\nReport: ${outPath}\n`,
    };
  } catch (error) {
    return diagnosticResult({ code: "TN_GAME_SCALE_FAILED", message: error instanceof Error ? error.message : String(error) }, { exitCode: 1, json, stderr: !json });
  } finally {
    await server?.close();
  }
}

async function readRenderedEntitiesFromPreview(previewUrl: string): Promise<IGameScaleEntityInput[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(previewUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10_000 });
    const renderedEntities = await page.evaluate(() => {
      const ready = (globalThis as {
        __THREENATIVE_READY__?: {
          runtimeDiagnostics?: {
            scene?: {
              renderedEntities?: unknown;
            };
          };
        };
      }).__THREENATIVE_READY__;
      return ready?.runtimeDiagnostics?.scene?.renderedEntities ?? [];
    });
    return Array.isArray(renderedEntities) ? renderedEntities as IGameScaleEntityInput[] : [];
  } finally {
    await browser.close();
  }
}
