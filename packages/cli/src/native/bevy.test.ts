import assert from "node:assert/strict";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { bevyRuntimeArgs, hasNativeDisplay, NativeHeadlessUnsupportedError, REQUIRED_BEVY_RUNTIME_FEATURES, resolveBevyRuntime, resolveBevyRuntimeBinaryPath, runBevyRuntime } from "./bevy.js";

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
    "--features",
    "native-webview",
    "--release",
    "--",
    bundlePath,
  ]);
});

test("should derive cargo arguments from the required runtime feature owner", () => {
  const args = bevyRuntimeArgs("/repo", { bundlePath: "/project/dist/game.bundle" }, {});
  assert.equal(args[args.indexOf("--features") + 1], REQUIRED_BEVY_RUNTIME_FEATURES.join(","));
});

test("should omit release profile when native debug profile is requested", () => {
  const repoRoot = "/repo";
  const bundlePath = "/project/dist/game.bundle";

  assert.deepEqual(bevyRuntimeArgs(repoRoot, { bundlePath }, { TN_NATIVE_PROFILE: "debug" }), [
    "run",
    "--manifest-path",
    resolve(repoRoot, "runtime-bevy/Cargo.toml"),
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_runtime",
    "--features",
    "native-webview",
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
      "--features",
      "native-webview",
      "--release",
      "--",
      bundlePath,
      "--proof-harness",
      "/tmp/proof-harness.json",
      "--readiness-out",
      "/tmp/readiness.json",
    ],
  );
});

test("should pass headless flag to runtime argv", () => {
  const args = bevyRuntimeArgs("/repo", { bundlePath: "/project/dist/game.bundle", headless: true }, {});

  assert.deepEqual(args.slice(-2), ["/project/dist/game.bundle", "--headless"]);
});

test("should emit structured waiver instead of winit crash without display", () => {
  assert.equal(hasNativeDisplay({}), false);
  assert.throws(
    () => runBevyRuntime({ bundlePath: "/project/dist/game.bundle", headless: true }),
    (error) => error instanceof NativeHeadlessUnsupportedError
      && error.code === "TN_PLAYTEST_NATIVE_HEADLESS_UNSUPPORTED"
      && !error.message.includes("winit"),
  );
});

test("should opt native proof harness into write auditing only when requested", () => {
  const args = bevyRuntimeArgs(
    "/repo",
    {
      bundlePath: "/project/dist/game.bundle",
      proofHarness: {
        auditWrites: true,
        commandStreamPath: "/tmp/proof-harness.json",
        readinessOutPath: "/tmp/readiness.json",
      },
    },
    {},
  );

  assert.deepEqual(args.slice(-6), [
    "/project/dist/game.bundle",
    "--proof-harness",
    "/tmp/proof-harness.json",
    "--readiness-out",
    "/tmp/readiness.json",
    "--audit-writes",
  ]);
});

test("should only reuse a runtime binary that reports every required cargo feature", async () => {
  const repoRoot = join(tmpdir(), `tn-bevy-runtime-binary-${process.pid}-${Date.now()}`);
  const releaseBinary = join(repoRoot, "runtime-bevy/target/release/threenative_runtime");
  const debugBinary = join(repoRoot, "runtime-bevy/target/debug/threenative_runtime");
  await mkdir(join(repoRoot, "runtime-bevy/target/release"), { recursive: true });
  await mkdir(join(repoRoot, "runtime-bevy/target/debug"), { recursive: true });
  await writeFile(releaseBinary, `#!/bin/sh\nprintf '%s\\n' '{"schema":"threenative.runtime-capabilities","cargoFeatures":[]}'\n`);
  await writeFile(debugBinary, `#!/bin/sh\nprintf '%s\\n' '{"schema":"threenative.runtime-capabilities","cargoFeatures":["native-webview"]}'\n`);
  await chmod(releaseBinary, 0o755);
  await chmod(debugBinary, 0o755);
  try {
    assert.equal(resolveBevyRuntimeBinaryPath(repoRoot, {}), debugBinary);
    assert.equal(resolveBevyRuntimeBinaryPath(repoRoot, { TN_NATIVE_PROFILE: "debug" }), debugBinary);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
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
