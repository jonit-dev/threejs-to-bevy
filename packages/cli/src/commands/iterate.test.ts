import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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

test("should copy latest artifacts to a timestamped directory when keep is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-iterate-keep-"));
  try {
    const result = await iterateCommand(["--project", root, "--skip-playtest", "--keep", "--json"], process.cwd(), {
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
