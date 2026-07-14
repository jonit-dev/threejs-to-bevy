import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { IDistributionSource } from "@threenative/ir";

import { buildAndroidTauriDistribution, deriveAndroidTauriConfig, prepareAndroidTauriProject, type AndroidCommandRunner } from "./androidTauri.js";
import { createCredentialHandle } from "./signing.js";

test("should derive android permissions only from declared capabilities", async () => {
  const config = await deriveAndroidTauriConfig(source(["camera", "network", "storage"]));

  assert.deepEqual(config.permissions, [
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.CAMERA",
    "android.permission.INTERNET",
  ]);
  assert.equal(config.permissions.includes("android.permission.RECORD_AUDIO"), false);
  assert.equal(config.appId, "com.threenative.chess");
  assert.equal(config.orientation, "landscape");
});

test("should replace the incompatible generated edge-to-edge activity", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "tn-android-tauri-activity-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const shellPath = join(root, "shell");
  await mkdir(shellPath, { recursive: true });
  const runner: AndroidCommandRunner = async (_command, args, options) => {
    if (args[1] !== "init") return;
    const sourceRoot = resolve(options.cwd, "gen/android/app/src/main");
    await mkdir(resolve(sourceRoot, "java/com/threenative/chess"), { recursive: true });
    await writeFile(resolve(options.cwd, "gen/android/app/build.gradle.kts"), androidGradleFixture());
    await writeFile(resolve(sourceRoot, "java/com/threenative/chess/MainActivity.kt"), [
      "package com.threenative.chess",
      "",
      "import android.os.Bundle",
      "import androidx.activity.enableEdgeToEdge",
      "",
      "class MainActivity : TauriActivity() {",
      "  override fun onCreate(savedInstanceState: Bundle?) {",
      "    enableEdgeToEdge()",
      "    super.onCreate(savedInstanceState)",
      "  }",
      "}",
      "",
    ].join("\n"));
  };

  await prepareAndroidTauriProject({
    commandRunner: runner,
    distribution: source(["storage"]),
    env: {},
    shellPath,
    tauriCliPath: "cargo-tauri",
  });

  assert.equal(
    await readFile(resolve(shellPath, "gen/android/app/src/main/java/com/threenative/chess/MainActivity.kt"), "utf8"),
    "package com.threenative.chess\n\nclass MainActivity : TauriActivity()\n",
  );
  assert.match(
    await readFile(resolve(shellPath, "gen/android/app/src/main/java/com/threenative/chess/generated/TauriActivity.kt"), "utf8"),
    /abstract class TauriActivity : WryActivity\(\)/,
  );
  assert.doesNotMatch(
    await readFile(resolve(shellPath, "gen/android/app/src/main/AndroidManifest.xml"), "utf8"),
    /android:configChanges="[^"]*screenSize/,
  );
});

test("should write an aab report with redacted signing metadata", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "tn-android-tauri-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const shellPath = join(root, "shell");
  const outputPath = join(root, "output");
  await mkdir(shellPath, { recursive: true });
  const canary = "android-secret-canary-123456";
  const credential = createCredentialHandle("ci:android-upload", JSON.stringify({
    keyAlias: "upload",
    keyPassword: canary,
    storeFile: join(root, "upload.jks"),
    storePassword: canary,
  }));
  const runner: AndroidCommandRunner = async (_command, args, options) => {
    if (args[1] === "init") {
      await mkdir(resolve(options.cwd, "gen/android/app/src/main"), { recursive: true });
      await writeFile(resolve(options.cwd, "gen/android/app/build.gradle.kts"), androidGradleFixture());
      return;
    }
    const artifact = resolve(options.cwd, "gen/android/app/build/outputs/bundle/release/app-release.aab");
    await mkdir(resolve(artifact, ".."), { recursive: true });
    await writeFile(artifact, "signed aab fixture");
  };

  const report = await buildAndroidTauriDistribution({
    architecture: "arm64",
    commandRunner: runner,
    credential,
    distribution: source(["storage"]),
    env: {},
    format: "aab",
    outputPath,
    shellPath,
    tauriCliPath: "cargo-tauri",
  });
  const serialized = await readFile(join(outputPath, "package-report.json"), "utf8");

  assert.equal(report.signing.status, "signed");
  assert.equal(report.signing.credentialRef, "ci:android-upload");
  assert.equal(report.signing.verification, "jarsigner");
  assert.match(report.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(serialized, /android-secret-canary/);
  await assert.rejects(readFile(join(shellPath, "gen/android/keystore.properties")), /ENOENT/);
  await assert.rejects(readFile(join(shellPath, "gen/android/app/signing.gradle.kts")), /ENOENT/);
  assert.equal(await readFile(join(shellPath, "gen/android/app/build.gradle.kts"), "utf8"), androidGradleFixture());
});

test("should report a debug apk signer without claiming the release credential", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "tn-android-tauri-apk-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const shellPath = join(root, "shell");
  const outputPath = join(root, "output");
  await mkdir(shellPath, { recursive: true });
  const credential = createCredentialHandle("ci:android-upload", JSON.stringify({
    keyAlias: "upload",
    keyPassword: "debug-apk-key-canary",
    storeFile: join(root, "upload.jks"),
    storePassword: "debug-apk-store-canary",
  }));
  const commands: string[][] = [];
  const runner: AndroidCommandRunner = async (command, args, options) => {
    commands.push([command, ...args]);
    if (args[1] === "init") {
      await mkdir(resolve(options.cwd, "gen/android/app/src/main"), { recursive: true });
      await writeFile(resolve(options.cwd, "gen/android/app/build.gradle.kts"), androidGradleFixture());
      return;
    }
    if (args[0] === "android") {
      const artifact = resolve(options.cwd, "gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk");
      await mkdir(resolve(artifact, ".."), { recursive: true });
      await writeFile(artifact, "android debug signed apk fixture");
    }
  };

  const report = await buildAndroidTauriDistribution({
    architecture: "x86_64",
    commandRunner: runner,
    credential,
    distribution: source([]),
    env: {},
    format: "apk",
    outputPath,
    shellPath,
    tauriCliPath: "cargo-tauri",
  });

  assert.deepEqual(report.signing, { status: "signed", verification: "apksigner" });
  assert.ok(commands.some(([command, operation]) => command?.endsWith("apksigner") && operation === "verify"));
  await assert.rejects(readFile(join(shellPath, "gen/android/keystore.properties")), /ENOENT/);
});

test("should reject an aab containing an individual credential secret", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "tn-android-tauri-leak-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const shellPath = join(root, "shell");
  await mkdir(shellPath, { recursive: true });
  const secret = "individual-secret-canary";
  const runner: AndroidCommandRunner = async (_command, args, options) => {
    if (args[1] === "init") {
      await mkdir(resolve(options.cwd, "gen/android/app/src/main"), { recursive: true });
      await writeFile(resolve(options.cwd, "gen/android/app/build.gradle.kts"), androidGradleFixture());
      return;
    }
    const artifact = resolve(options.cwd, "gen/android/app/build/outputs/bundle/release/app-release.aab");
    await mkdir(resolve(artifact, ".."), { recursive: true });
    await writeFile(artifact, `leaked ${secret}`);
  };

  await assert.rejects(buildAndroidTauriDistribution({
    architecture: "arm64",
    commandRunner: runner,
    credential: createCredentialHandle("ci:android-upload", JSON.stringify({
      keyAlias: "upload",
      keyPassword: secret,
      storeFile: join(root, "upload.jks"),
      storePassword: "different-store-secret",
    })),
    distribution: source(["storage"]),
    env: {},
    format: "aab",
    outputPath: join(root, "output"),
    shellPath,
    tauriCliPath: "cargo-tauri",
  }), /TN_PACKAGE_SECRET_LEAK/);
  assert.equal(await readFile(join(shellPath, "gen/android/app/build.gradle.kts"), "utf8"), androidGradleFixture());
});

function androidGradleFixture(): string {
  return "plugins {}\nandroid {\n  compileSdk = 36\n  defaultConfig {\n    minSdk = 24\n    targetSdk = 36\n  }\n}\n";
}

function source(capabilities: Array<"camera" | "network" | "storage">): IDistributionSource {
  return {
    app: { buildNumber: 1, displayName: "ThreeNative Chess", icons: "assets/chess.png", id: "com.threenative.chess", version: "1.0.0" },
    schema: "threenative.distribution",
    targets: [{ capabilities, formats: ["aab", "apk"], platform: "android", runtime: "webview" }],
    version: "0.1.0",
  };
}
