import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { verifyAdvancedUiArtifacts } from "./advancedUi.js";

test("should require recipe screenshots and accessibility reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-advanced-ui-"));
  try {
    let report = await verifyAdvancedUiArtifacts(root);
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing, [
      "artifacts/advanced-ui/screenshots/desktop.png",
      "artifacts/advanced-ui/screenshots/mobile.png",
      "artifacts/advanced-ui/accessibility/desktop.json",
      "artifacts/advanced-ui/accessibility/mobile.json",
      "artifacts/advanced-ui/fit/desktop.json",
      "artifacts/advanced-ui/fit/mobile.json",
      "artifacts/advanced-ui/visual-parity/effects.json",
      "artifacts/advanced-ui/visual-parity/attachments.json",
    ]);

    for (const artifact of report.required) {
      const path = join(root, artifact);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, artifact.includes("/visual-parity/") ? JSON.stringify(passingParityReport(artifact)) : "{}");
    }
    await writePassingParityImages(root, "effects");
    await writePassingParityImages(root, "attachments");

    report = await verifyAdvancedUiArtifacts(root);
    assert.equal(report.ok, true);
    assert.deepEqual(report.missing, []);
    assert.deepEqual(report.fitViolations, []);
    assert.deepEqual(report.parityViolations, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function passingParityReport(artifact: string): unknown {
  const name = artifact.endsWith("effects.json") ? "effects" : "attachments";
  return {
    artifacts: {
      bevyScreenshot: `artifacts/advanced-ui/visual-parity/${name}.bevy.png`,
      contactSheet: `artifacts/advanced-ui/visual-parity/${name}.contact.png`,
      webScreenshot: `artifacts/advanced-ui/visual-parity/${name}.web.png`,
    },
    metrics: {
      averageBrightnessDelta: 0.01,
      changedPixelRatio: 0.02,
      p95ChannelDelta: 0.03,
    },
    status: "pass",
    thresholds: {
      averageBrightnessDelta: 0.03,
      changedPixelRatio: 0.05,
      p95ChannelDelta: 0.08,
    },
    visualParity: "asserted",
  };
}

async function writePassingParityImages(root: string, name: "attachments" | "effects"): Promise<void> {
  for (const file of [`${name}.bevy.png`, `${name}.contact.png`, `${name}.web.png`]) {
    const path = join(root, "artifacts/advanced-ui/visual-parity", file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "png");
  }
}

test("should report ui fit clipping overlap focus and unsafe area failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-advanced-ui-"));
  try {
    for (const artifact of [
      "artifacts/advanced-ui/screenshots/desktop.png",
      "artifacts/advanced-ui/screenshots/mobile.png",
      "artifacts/advanced-ui/accessibility/desktop.json",
      "artifacts/advanced-ui/accessibility/mobile.json",
      "artifacts/advanced-ui/fit/mobile.json",
      "artifacts/advanced-ui/visual-parity/effects.json",
      "artifacts/advanced-ui/visual-parity/attachments.json",
    ]) {
      const path = join(root, artifact);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "{}");
    }
    const desktopFit = join(root, "artifacts/advanced-ui/fit/desktop.json");
    await mkdir(dirname(desktopFit), { recursive: true });
    await writeFile(
      desktopFit,
      JSON.stringify({
        clipping: [{ node: "hud.health" }],
        missingFocus: ["pause.resume"],
        overlap: [{ node: "inventory.slot.1" }],
        unsafeArea: [{ node: "toast.root" }],
      }),
    );

    const report = await verifyAdvancedUiArtifacts(root);
    assert.equal(report.ok, false);
    assert.deepEqual(report.fitViolations, [
      { category: "clipping", file: "artifacts/advanced-ui/fit/desktop.json", node: "hud.health" },
      { category: "missingFocus", file: "artifacts/advanced-ui/fit/desktop.json", node: "pause.resume" },
      { category: "overlap", file: "artifacts/advanced-ui/fit/desktop.json", node: "inventory.slot.1" },
      { category: "unsafeArea", file: "artifacts/advanced-ui/fit/desktop.json", node: "toast.root" },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require asserted web bevy visual parity reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-advanced-ui-"));
  try {
    for (const artifact of [
      "artifacts/advanced-ui/screenshots/desktop.png",
      "artifacts/advanced-ui/screenshots/mobile.png",
      "artifacts/advanced-ui/accessibility/desktop.json",
      "artifacts/advanced-ui/accessibility/mobile.json",
      "artifacts/advanced-ui/fit/desktop.json",
      "artifacts/advanced-ui/fit/mobile.json",
      "artifacts/advanced-ui/visual-parity/attachments.json",
    ]) {
      const path = join(root, artifact);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "{}");
    }
    const effects = join(root, "artifacts/advanced-ui/visual-parity/effects.json");
    await mkdir(dirname(effects), { recursive: true });
    await writeFile(
      effects,
      JSON.stringify({
        artifacts: {
          bevyScreenshot: "artifacts/advanced-ui/visual-parity/effects.bevy.png",
          contactSheet: "artifacts/advanced-ui/visual-parity/effects.contact.png",
          webScreenshot: "artifacts/advanced-ui/visual-parity/effects.web.png",
        },
        metrics: {
          averageBrightnessDelta: 0.01,
          changedPixelRatio: 0.02,
          p95ChannelDelta: 0.03,
        },
        status: "pass",
        thresholds: {
          averageBrightnessDelta: 0.03,
          changedPixelRatio: 0.05,
          p95ChannelDelta: 0.08,
        },
        visualParity: "asserted",
      }),
    );
    await writePassingParityImages(root, "effects");

    const report = await verifyAdvancedUiArtifacts(root);

    assert.equal(report.ok, false);
    assert.deepEqual(report.parityViolations, [
      { category: "status", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity report status must be pass." },
      { category: "status", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity must be asserted, not report-only." },
      { category: "artifact", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity report must include artifacts.webScreenshot." },
      { category: "artifact", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity report must include artifacts.bevyScreenshot." },
      { category: "artifact", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity report must include artifacts.contactSheet." },
      { category: "metric", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity report must include finite metrics.changedPixelRatio and thresholds.changedPixelRatio." },
      { category: "metric", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity report must include finite metrics.averageBrightnessDelta and thresholds.averageBrightnessDelta." },
      { category: "metric", file: "artifacts/advanced-ui/visual-parity/attachments.json", message: "Visual parity report must include finite metrics.p95ChannelDelta and thresholds.p95ChannelDelta." },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
