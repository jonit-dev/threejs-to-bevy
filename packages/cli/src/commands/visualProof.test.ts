import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recordCommand, screenshotCommand } from "./visualProof.js";

test("screenshot command should validate required arguments and png extension", async () => {
  const missing = await screenshotCommand(["--json"]);
  assert.equal(missing.exitCode, 1);
  assert.equal(JSON.parse(missing.stdout).code, "TN_SCREENSHOT_USAGE");

  const badExtension = await screenshotCommand(["--url", "http://localhost:3000", "--out", "proof.jpg", "--json"]);
  assert.equal(badExtension.exitCode, 1);
  assert.equal(JSON.parse(badExtension.stdout).code, "TN_SCREENSHOT_OUT_EXTENSION");
});

test("screenshot command should capture canvas proof with metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-screenshot-ok-"));
  try {
    const outPath = join(root, "proof.png");
    const html = encodeURIComponent(`<!doctype html>
      <canvas width="320" height="180" style="width:320px;height:180px"></canvas>
      <script>
        const canvas = document.querySelector("canvas");
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f97316";
        ctx.fillRect(0, 0, 320, 180);
        globalThis.__THREENATIVE_READY__ = {
          ok: true,
          diagnostics: [],
          runtimeDiagnostics: { assets: { resourceFailures: [] }, scene: { visibleMeshCount: 1 } }
        };
      </script>`);

    const result = await screenshotCommand(["--url", `data:text/html,${html}`, "--out", outPath, "--wait-ready", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      checks: { canvas: { ok: boolean; width: number }; nonblank: { ok: boolean }; visibleMeshCount: number };
      code: string;
      diagnostics: Array<{ code: string; severity: string }>;
      dimensions: { width: number };
      outPath: string;
      page: { browserLogs: string[]; errors: string[]; requestFailures: string[] };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_SCREENSHOT_OK");
    assert.equal(payload.outPath, outPath);
    assert.equal(payload.checks.canvas.ok, true);
    assert.equal(payload.checks.canvas.width, 320);
    assert.equal(payload.checks.nonblank.ok, true);
    assert.equal(payload.checks.visibleMeshCount, 1);
    assert.deepEqual(payload.diagnostics, []);
    assert.equal(payload.dimensions.width, 320);
    assert.deepEqual(payload.page.errors, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("screenshot command should report missing canvas separately", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-screenshot-missing-canvas-"));
  try {
    const outPath = join(root, "proof.png");
    const html = encodeURIComponent("<!doctype html><main style=\"width:320px;height:180px;background:#f97316\"></main>");

    const result = await screenshotCommand(["--url", `data:text/html,${html}`, "--out", outPath, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      diagnostics: Array<{ code: string; severity: string }>;
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_SCREENSHOT_FAILED");
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_SCREENSHOT_CANVAS_MISSING" && diagnostic.severity === "error"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("record command should validate required arguments and video extension", async () => {
  const missing = await recordCommand(["--json"]);
  assert.equal(missing.exitCode, 1);
  assert.equal(JSON.parse(missing.stdout).code, "TN_RECORD_USAGE");

  const badExtension = await recordCommand(["--url", "http://localhost:3000", "--out", "proof.gif", "--json"]);
  assert.equal(badExtension.exitCode, 1);
  assert.equal(JSON.parse(badExtension.stdout).code, "TN_RECORD_OUT_EXTENSION");
});
