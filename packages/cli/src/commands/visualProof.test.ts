import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("record command should support project duration cap and input script metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-record-options-"));
  try {
    const project = join(root, "game");
    await mkdir(join(project, "scripts"), { recursive: true });
    await writeFile(join(project, "scripts", "drive.js"), "globalThis.__recordInputRan = true;\n");

    const result = await recordCommand(
      ["--project", "game", "--url", "http://127.0.0.1:5173", "--out", "artifacts/proof.webm", "--duration", "99", "--input-script", "scripts/drive.js", "--json"],
      root,
      {
        recorder: async ({ inputScript, outPath, seconds, url }) => {
          assert.equal(outPath, join(project, "artifacts", "proof.webm"));
          assert.equal(seconds, 59);
          assert.equal(inputScript?.kind, "file");
          assert.equal(inputScript.path, join(project, "scripts", "drive.js"));
          return {
            byteSize: 1234,
            capturedAt: "2026-06-21T00:00:00.000Z",
            command: ["tn", "record"],
            format: "webm",
            fps: 30,
            inputScript: { kind: inputScript.kind, path: inputScript.path },
            outPath,
            runtimeReady: { ok: true },
            seconds,
            url,
            viewport: { height: 720, width: 1280 },
          };
        },
      },
    );
    const payload = JSON.parse(result.stdout) as {
      code: string;
      fps: number;
      inputScript: { kind: string; path: string };
      outPath: string;
      seconds: number;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_RECORD_OK");
    assert.equal(payload.seconds, 59);
    assert.equal(payload.fps, 30);
    assert.equal(payload.inputScript.kind, "file");
    assert.equal(payload.inputScript.path, join(project, "scripts", "drive.js"));
    assert.equal(payload.outPath, join(project, "artifacts", "proof.webm"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("record command should report browser video unavailable with stable code", async () => {
  const result = await recordCommand(["--url", "http://127.0.0.1:5173", "--out", "proof.webm", "--json"], process.cwd(), {
    recorder: async () => {
      throw new Error("Playwright did not produce a browser video artifact.");
    },
  });

  const payload = JSON.parse(result.stdout) as { code: string; message: string };
  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_RECORD_UNAVAILABLE");
  assert.match(payload.message, /Playwright did not produce/);
});
