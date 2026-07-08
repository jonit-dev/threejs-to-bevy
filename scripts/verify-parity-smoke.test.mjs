import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import { verifyParitySmokeGate } from "./verify-parity-smoke.mjs";

test("verify parity smoke records single-scene visual step", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-parity-smoke-"));
  const artifactDir = join(root, "artifacts");
  const webScreenshotPath = join(root, "web.png");
  const bevyScreenshotPath = join(root, "bevy.png");
  try {
    await sharp({
      create: {
        background: { b: 0, g: 0, r: 0 },
        channels: 3,
        height: 100,
        width: 100,
      },
    })
      .png()
      .toFile(webScreenshotPath);
    await sharp({
      create: {
        background: { b: 0, g: 0, r: 255 },
        channels: 3,
        height: 100,
        width: 100,
      },
    })
      .png()
      .toFile(bevyScreenshotPath);
    const report = await verifyParitySmokeGate({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      visualVerifierModule: {
        PARITY_SMOKE_CHECKPOINT: {
          id: "structured-stylized-nature-smoke",
          bundleRelativePath: "examples/stylized-nature-component/dist/stylized-nature-component.bundle",
          projectRelativePath: "examples/stylized-nature-component",
        },
        verifyBaselineVisualCheckpoint: async () => ({
          artifacts: { bevyScreenshotPath, webScreenshotPath },
          checkpoint: { id: "parity-smoke" },
          diagnostics: [],
          metrics: { signedAverageBrightnessDelta: 0 },
          status: "pass",
          visualComparison: {},
        }),
      },
    });

    assert.equal(report.status, "pass");
    assert.ok(report.steps.some((step) => step.name === "verify parity-smoke web bevy capture"));
    const visualReport = JSON.parse(await readFile(join(artifactDir, "parity-smoke-report.json"), "utf8"));
    assert.equal(visualReport.checkpoint.regionMetrics.length, 7);
    assert.ok(Math.abs(visualReport.checkpoint.regionMetrics[0].averageBrightnessDelta - 1 / 3) < 1e-12);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verify parity smoke fails when visual capture fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-parity-smoke-fail-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyParitySmokeGate({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      visualVerifierModule: {
        PARITY_SMOKE_CHECKPOINT: {
          id: "structured-stylized-nature-smoke",
          bundleRelativePath: "examples/stylized-nature-component/dist/stylized-nature-component.bundle",
          projectRelativePath: "examples/stylized-nature-component",
        },
        verifyBaselineVisualCheckpoint: async () => ({
          artifacts: {},
          checkpoint: { id: "parity-smoke" },
          diagnostics: [{ code: "TN_BASELINE_VISUAL_UNDEREXPOSURE", message: "dark", severity: "error" }],
          metrics: { signedAverageBrightnessDelta: -0.2 },
          status: "fail",
          visualComparison: {},
        }),
      },
    });

    assert.equal(report.status, "fail");
    assert.equal(report.code, "TN_VERIFY_PARITY_SMOKE_FAILED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verify parity smoke rejects stale no-setup bevy capture binary", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-parity-smoke-stale-"));
  const artifactDir = join(root, "artifacts");
  try {
    const binary = join(root, "runtime-bevy/target/debug/threenative_capture");
    const source = join(root, "runtime-bevy/crates/threenative_runtime/src/map_world.rs");
    await mkdir(join(root, "runtime-bevy/target/debug"), { recursive: true });
    await mkdir(join(root, "runtime-bevy/crates/threenative_runtime/src"), { recursive: true });
    await writeFile(join(root, "runtime-bevy/Cargo.toml"), "");
    await writeFile(join(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "");
    await writeFile(binary, "");
    await writeFile(source, "");
    await utimes(binary, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    await utimes(source, new Date("2026-01-02T00:00:00Z"), new Date("2026-01-02T00:00:00Z"));

    const report = await verifyParitySmokeGate({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      skipSetup: true,
    });

    assert.equal(report.status, "fail");
    assert.equal(report.steps.at(-1)?.name, "check bevy capture freshness");
    assert.match(report.steps.at(-1)?.stderr ?? "", /older than runtime source/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
