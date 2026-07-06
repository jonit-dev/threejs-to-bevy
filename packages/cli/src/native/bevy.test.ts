import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { bevyRuntimeArgs, resolveBevyRuntime } from "./bevy.js";

test("should select threenative runtime binary", () => {
  const repoRoot = "/repo";
  const bundlePath = "/project/dist/game.bundle";

  assert.deepEqual(bevyRuntimeArgs(repoRoot, { bundlePath }, {}), [
    "run",
    "--manifest-path",
    resolve(repoRoot, "runtime-bevy/Cargo.toml"),
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_runtime",
    "--",
    bundlePath,
  ]);
});

test("should pass native proof harness files to runtime binary", () => {
  const repoRoot = "/repo";
  const bundlePath = "/project/dist/game.bundle";

  assert.deepEqual(
    bevyRuntimeArgs(
      repoRoot,
      {
        bundlePath,
        proofHarness: {
          commandStreamPath: "/tmp/proof-harness.json",
          readinessOutPath: "/tmp/readiness.json",
        },
      },
      {},
    ),
    [
      "run",
      "--manifest-path",
      resolve(repoRoot, "runtime-bevy/Cargo.toml"),
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_runtime",
      "--",
      bundlePath,
      "--proof-harness",
      "/tmp/proof-harness.json",
      "--readiness-out",
      "/tmp/readiness.json",
    ],
  );
});

test("should resolve Bevy runtime from explicit repo root", () => {
  assert.deepEqual(resolveBevyRuntime("/installed/cli", { THREENATIVE_REPO_ROOT: "/repo" }), {
    cwd: resolve("/repo"),
    manifestPath: resolve("/repo", "runtime-bevy/Cargo.toml"),
  });
});

test("should resolve Bevy runtime from bundled manifest when present", () => {
  const bundledManifest = resolve(import.meta.dirname, "../../dist/runtime-bevy/Cargo.toml");

  assert.deepEqual(resolveBevyRuntime("/installed/cli", {}, bundledManifest), {
    cwd: resolve(import.meta.dirname, "../../dist/runtime-bevy"),
    manifestPath: bundledManifest,
  });
});

test("should resolve Bevy runtime from explicit manifest path", () => {
  assert.deepEqual(resolveBevyRuntime("/installed/cli", { THREENATIVE_BEVY_MANIFEST: "/repo/runtime-bevy/Cargo.toml" }), {
    cwd: resolve("/repo/runtime-bevy"),
    manifestPath: resolve("/repo/runtime-bevy/Cargo.toml"),
  });
});
