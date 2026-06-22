import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyCommand } from "./verify.js";
import type { IVerificationReport } from "../verify/report.js";

test("should fail when canvas is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-missing-canvas-"));
  try {
    const result = await verifyCommand(["--url", "http://127.0.0.1:5173", "--json"], root, {
      previewVerifier: async ({ artifactDir, previewUrl }) => ({
        artifacts: {
          reportPath: join(artifactDir, "verification-report.json"),
          screenshots: [],
        },
        checks: {},
        debug: {
          browserLogs: [],
          pageErrors: [],
          requestFailures: [],
        },
        diagnostics: [
          {
            code: "TN_VERIFY_CANVAS_MISSING",
            likelyArea: "runtime-web",
            message: "No canvas element was found in the web preview.",
            severity: "error",
          },
        ],
        previewUrl,
        status: "fail",
        thresholds: {
          diffChangedPixelRatio: 0.001,
          nonblankChangedPixelRatio: 0.002,
        },
      }),
    });

    const payload = JSON.parse(result.stdout) as IVerificationReport & { code: string };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_VERIFY_FAILED");
    assert.equal(payload.diagnostics[0]?.code, "TN_VERIFY_CANVAS_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit machine readable report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-report-"));
  try {
    const result = await verifyCommand(["--url", "http://127.0.0.1:5173", "--frames", "2", "--json"], root, {
      previewVerifier: async ({ artifactDir, frames, previewUrl }) => ({
        artifacts: {
          effectLogPath: join(artifactDir, "web-effect-log.json"),
          reportPath: join(artifactDir, "verification-report.json"),
          screenshots: [join(artifactDir, "frame-01.png"), join(artifactDir, "frame-02.png")],
        },
        checks: {
          canvas: { height: 720, ok: true, width: 1280 },
          frameDiff: {
            averageBrightnessDelta: 0.01,
            averageColorDelta: { blue: 0.01, green: 0.01, red: 0.01 },
            changedPixelRatio: 0,
            expectedMotion: false,
            ok: true,
            threshold: 0.001,
          },
          nonblank: { changedPixelRatio: 0.25, ok: true, threshold: 0.002 },
        },
        debug: {
          browserLogs: ["info: ready"],
          pageErrors: [],
          requestFailures: [],
          runtimeReady: { ok: true },
        },
        diagnostics: [],
        previewUrl,
        status: "pass",
        thresholds: {
          diffChangedPixelRatio: 0.001,
          nonblankChangedPixelRatio: 0.002,
        },
      }),
    });

    const payload = JSON.parse(result.stdout) as IVerificationReport & { code: string };
    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_VERIFY_OK");
    assert.equal(payload.previewUrl, "http://127.0.0.1:5173");
    assert.equal(payload.artifacts.screenshots.length, 2);
    assert.match(payload.artifacts.effectLogPath ?? "", /web-effect-log\.json$/);
    assert.equal(payload.debug.browserLogs[0], "info: ready");

    const saved = JSON.parse(await readFile(join(root, "artifacts/verify/verification-report.json"), "utf8")) as IVerificationReport;
    assert.equal(saved.status, "pass");
    assert.equal(saved.checks.canvas?.ok, true);
    assert.match(saved.artifacts.effectLogPath ?? "", /web-effect-log\.json$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reuse screenshot capture path for single-frame proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-shared-screenshot-"));
  try {
    const html = encodeURIComponent(`<!doctype html>
      <canvas width="320" height="180" style="width:320px;height:180px"></canvas>
      <script>
        const canvas = document.querySelector("canvas");
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(0, 0, 320, 180);
        globalThis.__THREENATIVE_READY__ = {
          ok: true,
          diagnostics: [],
          runtimeDiagnostics: { assets: { resourceFailures: [] }, scene: { visibleMeshCount: 1 } }
        };
      </script>`);

    const result = await verifyCommand(["--url", `data:text/html,${html}`, "--frames", "1", "--json"], root);
    const payload = JSON.parse(result.stdout) as IVerificationReport & { code: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_VERIFY_OK");
    assert.equal(payload.artifacts.screenshots.length, 1);
    assert.match(payload.artifacts.screenshots[0] ?? "", /frame-01\.png$/);
    assert.equal(payload.checks.canvas?.ok, true);
    assert.equal(payload.checks.nonblank?.ok, true);
    assert.equal(payload.debug.requestFailures.length, 0);

    const saved = JSON.parse(await readFile(join(root, "artifacts/verify/verification-report.json"), "utf8")) as IVerificationReport;
    assert.equal(saved.status, "pass");
    assert.equal(saved.artifacts.screenshots.length, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should write reports under the project path when a URL is reused", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-project-url-"));
  try {
    await mkdir(join(root, "app"));
    await writeFile(join(root, "app", "threenative.config.json"), "{}");

    const result = await verifyCommand(["--project", "app", "--url", "http://127.0.0.1:5173", "--json"], root, {
      previewVerifier: async ({ artifactDir, previewUrl }) => ({
        artifacts: {
          reportPath: join(artifactDir, "verification-report.json"),
          screenshots: [],
        },
        checks: {},
        debug: {
          browserLogs: [],
          pageErrors: [],
          requestFailures: [],
        },
        diagnostics: [],
        previewUrl,
        status: "pass",
        thresholds: {
          diffChangedPixelRatio: 0.001,
          nonblankChangedPixelRatio: 0.002,
        },
      }),
    });

    const payload = JSON.parse(result.stdout) as IVerificationReport;
    assert.equal(result.exitCode, 0);
    assert.match(payload.artifacts.reportPath, /app\/artifacts\/verify\/verification-report\.json$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
