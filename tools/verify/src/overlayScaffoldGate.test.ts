import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveOverlayScaffold } from "@threenative/cli/overlay-scaffold";

import { inspectOverlayProject, runOverlayScaffoldGate } from "./overlayScaffoldGate.js";

test("should inspect independent Tailwind and vanilla generated overlay output", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tn-overlay-scaffold-inspection-"));
  try {
    const measurements = [];
    for (const style of ["tailwind", "vanilla"] as const) {
      const descriptor = resolveOverlayScaffold(style)!;
      const overlayRoot = resolve(root, style, descriptor.sourceDirectory, "proof-panel");
      await mkdir(resolve(overlayRoot, "dist/assets"), { recursive: true });
      await mkdir(resolve(overlayRoot, "src"), { recursive: true });
      await writeFile(resolve(root, style, "package.json"), JSON.stringify({ devDependencies: descriptor.devDependencies }));
      await writeFile(resolve(overlayRoot, "dist/index.html"), '<link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>');
      await writeFile(resolve(overlayRoot, "dist/assets/app.css"), style === "tailwind" ? ".max-w-sm{max-width:24rem}" : ".panel{padding:1rem}");
      await writeFile(resolve(overlayRoot, "dist/assets/app.js"), "document.querySelector('main');");
      await writeFile(resolve(overlayRoot, "src/App.tsx"), 'overlayClient.subscribe("overlay:snapshot", () => undefined);');
      await writeFile(resolve(overlayRoot, "src/client.ts"), 'import { createOverlayClient } from "@threenative/overlay-client";');
      await writeFile(resolve(overlayRoot, "src/styles.css"), style === "tailwind" ? '@import "tailwindcss" source("./");' : ".panel{padding:1rem}");
      const result = await inspectOverlayProject(resolve(root, style), descriptor, "proof-panel");
      assert.deepEqual(result.diagnostics, []);
      measurements.push(result.measurement);
    }
    assert.equal(measurements.every((measurement) => measurement.cssBytes > 0 && measurement.jsBytes > 0), true);
    assert.notEqual(measurements[0]?.cssBytes, measurements[1]?.cssBytes);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should build both real generated overlay presets from a clean maintained starter", { timeout: 120_000 }, async () => {
  const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const reportPath = resolve(tmpdir(), `tn-overlay-scaffold-real-${Date.now()}.json`);
  try {
    const result = await runOverlayScaffoldGate({ reportPath, root });
    assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    assert.deepEqual(result.measurements.map((measurement) => measurement.style), ["tailwind", "vanilla"]);
    assert.equal(result.measurements.every((measurement) => measurement.cssBytes > 0 && measurement.jsBytes > 0), true);
    assert.equal(result.measurements.find((measurement) => measurement.style === "tailwind")?.packagedAssetCount, 2);
  } finally {
    await rm(reportPath, { force: true });
  }
});

test("should reject remote output and vanilla Tailwind cross-contamination", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tn-overlay-scaffold-negative-"));
  try {
    const descriptor = resolveOverlayScaffold("vanilla")!;
    const overlayRoot = resolve(root, descriptor.sourceDirectory, "proof-panel");
    await mkdir(resolve(overlayRoot, "dist/assets"), { recursive: true });
    await mkdir(resolve(overlayRoot, "src"), { recursive: true });
    await writeFile(resolve(root, "package.json"), JSON.stringify({ devDependencies: { tailwindcss: "1.0.0" } }));
    await writeFile(resolve(overlayRoot, "dist/index.html"), '<script src="https://example.com/app.js"></script>');
    await writeFile(resolve(overlayRoot, "dist/assets/app.css"), ".panel{}");
    await writeFile(resolve(overlayRoot, "dist/assets/app.js"), "export {};");
    await writeFile(resolve(overlayRoot, "src/styles.css"), '@import "tailwindcss";');
    const result = await inspectOverlayProject(root, descriptor, "proof-panel");
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_OVERLAY_SCAFFOLD_REMOTE_ASSET"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_OVERLAY_SCAFFOLD_PRESET_CONTAMINATION"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
