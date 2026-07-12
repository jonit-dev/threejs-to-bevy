import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateIterateReport } from "@threenative/authoring";
import { iterateCommand } from "./iterate.js";

test("should mark build and capture skipped when validate fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-validate-fails-"));
  try {
    const result = await iterateCommand(["--project", root, "--json"], process.cwd(), {
      validate: async () => ({
        exitCode: 1,
        stdout: `${JSON.stringify({ code: "TN_AUTHORING_VALIDATE_FAILED", diagnostics: [{ code: "TN_BAD_SOURCE", message: "Bad source.", severity: "error" }] })}\n`,
      }),
    });
    const payload = JSON.parse(result.stdout) as { artifacts: { report: string }; steps: Array<{ id: string; status: string }> };
    const report = JSON.parse(await readFile(payload.artifacts.report, "utf8")) as { steps: Array<{ id: string; status: string }> };

    assert.equal(result.exitCode, 1);
    assert.deepEqual(payload.steps.map((step) => [step.id, step.status]), [
      ["validate", "fail"],
      ["build", "skipped"],
      ["screenshot", "skipped"],
      ["playtest", "skipped"],
    ]);
    assert.deepEqual(report.steps.map((step) => [step.id, step.status]), payload.steps.map((step) => [step.id, step.status]));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass validate and build when starter project is clean", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-clean-"));
  try {
    const result = await iterateCommand(["--project", root, "--skip-playtest", "--json"], process.cwd(), {
      analyzeScreenshot: passingScreenshotAnalysis,
      build: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify({ code: "TN_BUILD_OK", bundlePath: join(root, "dist", "game.bundle") })}\n`,
      }),
      capture: async ({ outPath, url }) => ({
        byteSize: 42,
        capturedAt: "2026-07-06T00:00:00.000Z",
        checks: { canvas: { height: 720, ok: true, width: 1280 } },
        diagnostics: [],
        outPath,
        runtimeReady: { ok: true },
        url,
        viewport: { height: 720, width: 1280 },
      }),
      startPreview: async () => ({ close: async () => undefined, url: "http://127.0.0.1:1" }),
      validate: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify({ code: "TN_AUTHORING_VALIDATE_OK", diagnostics: [], ok: true })}\n`,
      }),
    });
    const payload = JSON.parse(result.stdout);
    const report = JSON.parse(await readFile(payload.artifacts.report, "utf8"));
    const schema = validateIterateReport(report);

    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(payload.schema, undefined);
    assert.equal(schema.ok, true);
    assert.equal(payload.steps.find((step: { id: string }) => step.id === "validate")?.status, "pass");
    assert.equal(payload.steps.find((step: { id: string }) => step.id === "build")?.status, "pass");
    assert.equal(payload.steps.find((step: { id: string }) => step.id === "screenshot")?.status, "pass");
    assert.equal(payload.steps.find((step: { id: string }) => step.id === "playtest")?.status, "pass");
    assert.equal(report.code, "TN_ITERATE_OK");
    assert.ok(Buffer.byteLength(result.stdout, "utf8") < 2048);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit TN_ITERATE_NO_SCENARIO info when project has no playtests", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-no-scenario-"));
  try {
    const result = await iterateCommand(["--project", root, "--json"], process.cwd(), {
      analyzeScreenshot: passingScreenshotAnalysis,
      build: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify({ code: "TN_BUILD_OK", bundlePath: join(root, "dist", "game.bundle") })}\n`,
      }),
      capture: async ({ outPath, url }) => ({
        byteSize: 42,
        capturedAt: "2026-07-06T00:00:00.000Z",
        checks: { canvas: { height: 720, ok: true, width: 1280 } },
        diagnostics: [],
        outPath,
        runtimeReady: { ok: true },
        url,
        viewport: { height: 720, width: 1280 },
      }),
      startPreview: async () => ({ close: async () => undefined, url: "http://127.0.0.1:1" }),
      validate: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify({ code: "TN_AUTHORING_VALIDATE_OK", diagnostics: [], ok: true })}\n`,
      }),
    });
    const payload = JSON.parse(result.stdout) as { artifacts: { report: string }; diagnostics: Array<{ code: string; severity: string }>; ok: boolean };
    const report = JSON.parse(await readFile(payload.artifacts.report, "utf8")) as { diagnostics: Array<{ code: string; severity: string }> };

    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_ITERATE_NO_SCENARIO" && diagnostic.severity === "info"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report active render profile in iterate json", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-render-profile-"));
  try {
    const result = await iterateCommand(["--project", root, "--skip-playtest", "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      build: () => buildWithProfile(root, "cinematic"),
    });
    const payload = JSON.parse(result.stdout) as { activeRenderProfile?: string };
    assert.equal(payload.activeRenderProfile, "cinematic");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should warn when material edits run under a grading profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-render-warning-"));
  try {
    await mkdir(join(root, "content/materials"), { recursive: true });
    await writeFile(join(root, "content/materials/main.materials.json"), `${JSON.stringify({ id: "main", materials: [], schema: "threenative.materials" })}\n`);
    const result = await iterateCommand(["--project", root, "--skip-playtest", "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      build: () => buildWithProfile(root, "cinematic"),
    });
    const reportPath = (JSON.parse(result.stdout) as { artifacts: { report: string } }).artifacts.report;
    const report = JSON.parse(await readFile(reportPath, "utf8")) as { diagnostics: Array<{ code: string; severity: string }> };
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_RENDER_PROFILE_GRADING_ACTIVE" && diagnostic.severity === "warning"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should not warn under parity profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-render-parity-"));
  try {
    await mkdir(join(root, "content/materials"), { recursive: true });
    await writeFile(join(root, "content/materials/main.materials.json"), `${JSON.stringify({ id: "main", materials: [], schema: "threenative.materials" })}\n`);
    const result = await iterateCommand(["--project", root, "--skip-playtest", "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      build: () => buildWithProfile(root, "parity"),
    });
    const reportPath = (JSON.parse(result.stdout) as { artifacts: { report: string } }).artifacts.report;
    const report = JSON.parse(await readFile(reportPath, "utf8")) as { diagnostics: Array<{ code: string }> };
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_RENDER_PROFILE_GRADING_ACTIVE"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass visual verdict while gameplay scenario fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-split-verdict-"));
  try {
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/fail.playtest.json"), "{}\n");
    const result = await iterateCommand(["--project", root, "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      playtest: async () => playtestSummaryResult("fail", false, {
        diagnostics: [{ code: "TN_PLAYTEST_ASSERTION_FAILED", message: "Stale assertion failed.", severity: "error" }],
      }),
    });
    const payload = JSON.parse(result.stdout) as { ok: boolean; verdicts: { gameplay: string; visual: string } };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.deepEqual(payload.verdicts, { gameplay: "fail", visual: "pass" });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should skip scenarios under --visual-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-visual-only-"));
  try {
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/stale.playtest.json"), "{}\n");
    let playtestInvoked = false;
    const result = await iterateCommand(["--project", root, "--visual-only", "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      playtest: async () => {
        playtestInvoked = true;
        return playtestSummaryResult("stale", false);
      },
    });
    const payload = JSON.parse(result.stdout) as { artifacts: { report: string }; verdicts: { gameplay: string; visual: string } };
    const report = JSON.parse(await readFile(payload.artifacts.report, "utf8")) as { diagnostics: Array<{ code: string }> };

    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(playtestInvoked, false);
    assert.deepEqual(payload.verdicts, { gameplay: "skipped", visual: "pass" });
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_ITERATE_GAMEPLAY_SKIPPED_VISUAL_ONLY"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail visual verdict on flat low-quality screenshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-flat-screenshot-"));
  try {
    const result = await iterateCommand(["--project", root, "--visual-only", "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      analyzeScreenshot: async () => ({
        colorBucketCount: 1,
        localContrast: 0,
        ok: false,
        thresholds: { minColorBuckets: 4, minLocalContrast: 0.04 },
      }),
    });
    const payload = JSON.parse(result.stdout) as { artifacts: { report: string }; ok: boolean; verdicts: { gameplay: string; visual: string } };
    const report = JSON.parse(await readFile(payload.artifacts.report, "utf8")) as { diagnostics: Array<{ code: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.ok, false);
    assert.deepEqual(payload.verdicts, { gameplay: "skipped", visual: "fail" });
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_ITERATE_SCREENSHOT_LOW_QUALITY"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should run all scenarios when no scenario flag given", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-all-scenarios-"));
  try {
    await writeFile(join(root, "a.playtest.json"), "{}");
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/b.playtest.json"), "{}\n");
    await writeFile(join(root, "playtests/a.playtest.json"), "{}\n");
    const seen: string[] = [];
    const result = await iterateCommand(["--project", root, "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      playtest: async (args) => {
        const scenario = args[args.indexOf("--scenario") + 1] ?? "";
        seen.push(scenario);
        return playtestSummaryResult(scenario.replace(/^playtests\//, "").replace(/\.playtest\.json$/, ""), true);
      },
    });
    const payload = JSON.parse(result.stdout) as { steps: Array<{ id: string; scenarios?: Array<{ scenario: string }> }> };

    assert.equal(result.exitCode, 0, result.stdout);
    assert.deepEqual(seen, ["playtests/a.playtest.json", "playtests/b.playtest.json"]);
    assert.deepEqual(payload.steps.find((step) => step.id === "playtest")?.scenarios?.map((scenario) => scenario.scenario), ["a", "b"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("default iterate skips native scenarios unless --native is explicit", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-web-default-"));
  try {
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/web.playtest.json"), `${JSON.stringify({ target: "web" })}\n`);
    await writeFile(join(root, "playtests/native.playtest.json"), `${JSON.stringify({ target: "desktop" })}\n`);
    const seen: string[] = [];
    const options = {
      ...passingIterateOptions(root),
      playtest: async (args: readonly string[]) => {
        const scenario = args[args.indexOf("--scenario") + 1] ?? "";
        seen.push(scenario);
        return playtestSummaryResult(scenario.replace(/^playtests\//, "").replace(/\.playtest\.json$/, ""), true);
      },
    };

    const defaultResult = await iterateCommand(["--project", root, "--json"], process.cwd(), options);
    assert.equal(defaultResult.exitCode, 0, defaultResult.stdout);
    assert.deepEqual(seen, ["playtests/web.playtest.json"]);

    seen.length = 0;
    const nativeResult = await iterateCommand(["--project", root, "--native", "--json"], process.cwd(), options);
    assert.equal(nativeResult.exitCode, 0, nativeResult.stdout);
    assert.deepEqual(seen, ["playtests/native.playtest.json", "playtests/web.playtest.json"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should include observed assertion values when a scenario fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-failed-values-"));
  try {
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/fail.playtest.json"), "{}\n");
    const result = await iterateCommand(["--project", root, "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      playtest: async () => playtestSummaryResult("fail", false, {
        assertions: [
          {
            details: { after: "Score 0 / 3", expected: { textIncludes: "Score 3 / 3" }, id: "score-label" },
            id: "hud.score-label",
            pass: false,
          },
        ],
        diagnostics: [{ code: "TN_PLAYTEST_HUD_ASSERTION_FAILED", message: "HUD assertion failed.", severity: "error", systemId: "hud-system" }],
      }),
    });
    const payload = JSON.parse(result.stdout) as { steps: Array<{ id: string; scenarios?: Array<{ assertions: Array<{ expected?: unknown; observed?: unknown; owningSystem?: string }> }> }> };
    const failed = payload.steps.find((step) => step.id === "playtest")?.scenarios?.[0]?.assertions[0];

    assert.equal(result.exitCode, 1);
    assert.deepEqual(failed?.expected, { textIncludes: "Score 3 / 3" });
    assert.equal(failed?.observed, "Score 0 / 3");
    assert.equal(failed?.owningSystem, "hud-system");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should keep per-scenario summary within byte budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-budget-"));
  try {
    await mkdir(join(root, "playtests"), { recursive: true });
    await writeFile(join(root, "playtests/verbose.playtest.json"), "{}\n");
    const result = await iterateCommand(["--project", root, "--json"], process.cwd(), {
      ...passingIterateOptions(root),
      playtest: async () => playtestSummaryResult("verbose", false, {
        assertions: Array.from({ length: 20 }, (_, index) => ({
          details: { after: `observed-${index}`, expected: { textIncludes: `expected-${index}` } },
          id: `hud.verbose-${index}`,
          pass: false,
        })),
        diagnostics: Array.from({ length: 20 }, (_, index) => ({
          code: "TN_PLAYTEST_HUD_ASSERTION_FAILED",
          message: `HUD assertion ${index} failed. ${"x".repeat(400)}`,
          severity: "error",
        })),
      }),
    });
    const payload = JSON.parse(result.stdout) as { steps: Array<{ id: string; scenarios?: unknown[] }> };
    const scenario = payload.steps.find((step) => step.id === "playtest")?.scenarios?.[0];

    assert.equal(result.exitCode, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(scenario), "utf8") <= 2048);
    assert.equal((scenario as { truncated?: boolean }).truncated, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should copy latest artifacts to a timestamped directory when keep is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-keep-"));
  try {
    const result = await iterateCommand(["--project", root, "--skip-playtest", "--keep", "--json"], process.cwd(), {
      analyzeScreenshot: passingScreenshotAnalysis,
      build: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify({ code: "TN_BUILD_OK", bundlePath: join(root, "dist", "game.bundle") })}\n`,
      }),
      capture: async ({ outPath, url }) => {
        await writeFile(outPath, "png");
        return {
          byteSize: 3,
          capturedAt: "2026-07-06T00:00:00.000Z",
          checks: { canvas: { height: 720, ok: true, width: 1280 } },
          diagnostics: [],
          outPath,
          runtimeReady: { ok: true },
          url,
          viewport: { height: 720, width: 1280 },
        };
      },
      startPreview: async () => ({ close: async () => undefined, url: "http://127.0.0.1:1" }),
      validate: async () => ({
        exitCode: 0,
        stdout: `${JSON.stringify({ code: "TN_AUTHORING_VALIDATE_OK", diagnostics: [], ok: true })}\n`,
      }),
    });
    const payload = JSON.parse(result.stdout) as { artifacts: { report: string } };
    const report = JSON.parse(await readFile(payload.artifacts.report, "utf8")) as { artifacts: { keptDirectory: string } };

    assert.equal(result.exitCode, 0, result.stdout);
    await stat(join(report.artifacts.keptDirectory, "report.json"));
    await stat(join(report.artifacts.keptDirectory, "screenshot.png"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function passingIterateOptions(root: string): Parameters<typeof iterateCommand>[2] {
  return {
    analyzeScreenshot: passingScreenshotAnalysis,
    build: async () => ({
      exitCode: 0,
      stdout: `${JSON.stringify({ code: "TN_BUILD_OK", bundlePath: join(root, "dist", "game.bundle") })}\n`,
    }),
    capture: async ({ outPath, url }) => ({
      byteSize: 42,
      capturedAt: "2026-07-06T00:00:00.000Z",
      checks: { canvas: { height: 720, ok: true, width: 1280 } },
      diagnostics: [],
      outPath,
      runtimeReady: { ok: true },
      url,
      viewport: { height: 720, width: 1280 },
    }),
    startPreview: async () => ({ close: async () => undefined, url: "http://127.0.0.1:1" }),
    validate: async () => ({
      exitCode: 0,
      stdout: `${JSON.stringify({ code: "TN_AUTHORING_VALIDATE_OK", diagnostics: [], ok: true })}\n`,
    }),
  };
}

async function passingScreenshotAnalysis() {
  return {
    colorBucketCount: 8,
    localContrast: 0.2,
    ok: true,
    thresholds: { minColorBuckets: 4, minLocalContrast: 0.04 },
  };
}

async function buildWithProfile(root: string, profile: string) {
  const bundlePath = join(root, "dist", "game.bundle");
  await mkdir(bundlePath, { recursive: true });
  await writeFile(join(bundlePath, "runtime.config.json"), `${JSON.stringify({ renderer: { renderLook: { profile } }, schema: "threenative.runtime-config", version: "0.1.0" })}\n`);
  return { exitCode: 0, stdout: `${JSON.stringify({ bundlePath, code: "TN_BUILD_OK" })}\n` };
}

function playtestSummaryResult(
  scenario: string,
  pass: boolean,
  overrides: {
    assertions?: Array<{ details?: Record<string, unknown>; id: string; pass: boolean }>;
    diagnostics?: Array<{ code: string; message: string; severity: "error"; systemId?: string }>;
  } = {},
): { exitCode: number; stdout: string } {
  return {
    exitCode: pass ? 0 : 1,
    stdout: `${JSON.stringify({
      artifacts: {
        directory: `artifacts/playtest/${scenario}`,
        summary: `artifacts/playtest/${scenario}/summary.json`,
      },
      assertions: overrides.assertions ?? [{ details: { distance: 1, threshold: 0.01 }, id: "movement", pass: true }],
      code: pass ? "TN_PLAYTEST_OK" : "TN_PLAYTEST_FAILED",
      diagnostics: overrides.diagnostics ?? [],
      pass,
      scenario,
      schema: "threenative.playtest-summary",
    })}\n`,
  };
}
