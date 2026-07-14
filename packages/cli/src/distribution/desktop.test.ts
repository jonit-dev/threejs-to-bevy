import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { IDistributionSource } from "@threenative/ir";

import { buildDesktopWebviewDistribution, resolveDesktopDistributionPlan, verifyDesktopCredentialOutputs, type IDesktopDistributionReport } from "./desktop.js";
import { createCredentialHandle, resolveCredentialHandle } from "./signing.js";

test("should select bevy or tauri without changing authored source", () => {
  const distribution = source();
  const before = JSON.stringify(distribution);
  const bevy = resolveDesktopDistributionPlan({ distribution, format: "tar", platform: "linux", release: false, runtime: "bevy", unsigned: true });
  const webview = resolveDesktopDistributionPlan({ distribution, format: "tar", platform: "linux", release: false, runtime: "webview", unsigned: true });

  assert.equal(bevy.adapter, "bevy");
  assert.equal(webview.adapter, "tauri");
  assert.equal(bevy.sourceHash, webview.sourceHash);
  assert.equal(JSON.stringify(distribution), before);
});

test("should redact credential canaries from every output surface", async (context) => {
  const credential = createCredentialHandle("ci:windows-signing", "secret-canary-123456");
  const root = await mkdtemp(join(tmpdir(), "tn-desktop-credential-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  const artifactPath = join(root, "game.AppImage");
  await writeFile(artifactPath, "clean packaged artifact");
  const report = desktopReport(`build used ${credential.value}`);
  const serialized = await verifyDesktopCredentialOutputs({ artifactPath, credentials: [credential], report });

  assert.doesNotMatch(serialized, /secret-canary/);
  assert.match(serialized, /\[REDACTED\]/);
  await writeFile(artifactPath, `archive contains ${credential.value}`);
  await assert.rejects(
    verifyDesktopCredentialOutputs({ artifactPath, credentials: [credential], report }),
    /TN_PACKAGE_SECRET_LEAK/,
  );
  assert.equal(resolveCredentialHandle("ci:windows-signing", { THREENATIVE_CREDENTIAL_WINDOWS_SIGNING: credential.value }).reference, credential.reference);
});

test("should reject desktop output that overlaps the source bundle", async () => {
  await assert.rejects(
    buildDesktopWebviewDistribution({
      distribution: source(),
      format: "tar",
      outputPath: "/tmp/tn-desktop-safe/dist/chess.bundle",
      platform: "linux",
      projectPath: "/tmp/tn-desktop-safe",
      release: false,
      sourceBundlePath: "/tmp/tn-desktop-safe/dist/chess.bundle",
      tauriCliPath: "cargo-tauri",
      unsigned: true,
    }),
    /TN_PACKAGE_OUTPUT_OVERLAP/,
  );
});

function source(): IDistributionSource {
  return {
    app: { buildNumber: 1, displayName: "Chess", icons: "assets/chess.png", id: "com.threenative.chess", version: "1.0.0" },
    schema: "threenative.distribution",
    targets: [
      { formats: ["tar", "appimage"], platform: "linux", runtime: "bevy" },
      { capabilities: ["storage"], formats: ["tar", "appimage"], platform: "linux", runtime: "webview" },
    ],
    version: "0.1.0",
  };
}

function desktopReport(reproductionCommand: string): IDesktopDistributionReport {
  return {
    architecture: "x86_64",
    artifact: { bytes: 0, path: "game.AppImage", sha256: "a".repeat(64) },
    build: { status: "passed" },
    bundleSha256: "b".repeat(64),
    code: "TN_PACKAGE_DESKTOP_OK",
    format: "appimage",
    host: process.platform,
    platform: "linux",
    reproductionCommand,
    runtime: "webview",
    schema: "threenative.package-report",
    signing: { credentialRef: "ci:windows-signing", status: "signed" },
    sourceHash: "c".repeat(64),
    toolchain: { cargo: "locked", tauriCli: "2.11.4", tauriRuntime: "2.11.5" },
    version: "0.1.0",
  };
}
