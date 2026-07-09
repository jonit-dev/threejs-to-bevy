import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runGameProductionGate } from "./gameProductionGate.js";
import { minimalPngHeader } from "./gameProductionGateTestUtils.js";

test("requires visual-quality proof metrics for generated-game aggregate projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-metrics-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_METRICS_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("summarizes generated-game visual metric ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-summary-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      metrics: {
        colorBucketCount: 42,
        height: 720,
        localContrastRatio: 0.018,
        nonblank: { changedPixelRatio: 0.97 },
        visibleBoundsAreaRatio: 0.33,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: false }],
      reportPath,
      root,
    });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      summary: {
        visualQualityMetrics: {
          maxColorBucketCount: number;
          maxLocalContrastRatio: number;
          minColorBucketCount: number;
          minLocalContrastRatio: number;
          minNonblankRatio: number;
          minVisibleBoundsAreaRatio: number;
          projectCount: number;
        };
      };
    };

    assert.deepEqual(report.summary.visualQualityMetrics, {
      maxColorBucketCount: 42,
      maxLocalContrastRatio: 0.018,
      minColorBucketCount: 42,
      minLocalContrastRatio: 0.018,
      minNonblankRatio: 0.97,
      minVisibleBoundsAreaRatio: 0.33,
      projectCount: 1,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game visual-quality proof with weak metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-weak-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      metrics: {
        colorBucketCount: 4,
        height: 720,
        localContrastRatio: 0.002,
        nonblank: { changedPixelRatio: 0.2 },
        visibleBoundsAreaRatio: 0.02,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_NONBLANK_LOW"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_BOUNDS_LOW"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_COLOR_LOW"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_CONTRAST_LOW"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires generated-game visual-quality proof screenshot artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-screenshot-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics: {
        colorBucketCount: 64,
        height: 720,
        localContrastRatio: 0.02,
        nonblank: { changedPixelRatio: 1 },
        visibleBoundsAreaRatio: 1,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_SCREENSHOT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game visual-quality proof with stale screenshot dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-dimensions-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), minimalPngHeader(640, 480));
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics: {
        colorBucketCount: 64,
        height: 720,
        localContrastRatio: 0.02,
        nonblank: { changedPixelRatio: 1 },
        visibleBoundsAreaRatio: 1,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_SCREENSHOT_DIMENSIONS_MISMATCH"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("requires generated-game visual-quality metric bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-bundle-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), minimalPngHeader(1280, 720));
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics: {
        colorBucketCount: 64,
        height: 720,
        localContrastRatio: 0.02,
        nonblank: { changedPixelRatio: 1 },
        visibleBoundsAreaRatio: 1,
        width: 1280,
      },
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_BUNDLE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects generated-game visual-quality metric bundle drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-generated-game-visual-bundle-drift-gate-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await mkdir(join(root, "artifacts/game-production"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), `${JSON.stringify({ schema: "threenative.scene", id: "arena" }, null, 2)}\n`);
    await writeFile(join(root, "artifacts/game-production/screenshot.png"), minimalPngHeader(1280, 720));
    await writeFile(join(root, "artifacts/game-production/visual-quality.json"), `${JSON.stringify({
      schema: "threenative.game-visual-quality-proof",
      status: "pass",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics: {
        colorBucketCount: 64,
        height: 720,
        localContrastRatio: 0.02,
        nonblank: { changedPixelRatio: 1 },
        visibleBoundsAreaRatio: 1,
        width: 1280,
      },
      metricBundles: [{
        id: "game-quality",
        metrics: {
          colorBucketCount: 12,
          localContrastRatio: 0.02,
          nonblankRatio: 1,
          visibleBoundsAreaRatio: 1,
        },
        ok: true,
        thresholds: {
          minColorBucketCount: 12,
          minLocalContrastRatio: 0.01,
          minNonblankRatio: 0.55,
          minVisibleBoundsAreaRatio: 0.08,
        },
      }],
    }, null, 2)}\n`);
    const reportPath = join(root, "artifacts/game-production/verification-report.json");

    const result = await runGameProductionGate({
      projects: [{ projectPath: ".", requireVisualQuality: true }],
      reportPath,
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_GAME_VISUAL_QUALITY_BUNDLE_STALE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
