import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyDesktopDistribution } from "./verify-desktop-distribution.mjs";

test("should verify artifacts, evidence, formats, proof, and reproducibility for each implemented desktop row", async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "tn-desktop-proof-"));
  context.after(() => rm(workspaceRoot, { force: true, recursive: true }));
  await mkdir(join(workspaceRoot, "proof"));
  await writeFile(join(workspaceRoot, "proof", "launch.png"), "screenshot");
  await writeFile(join(workspaceRoot, "proof", "game.tar.gz"), "tar artifact");
  await writeFile(join(workspaceRoot, "proof", "game.AppImage"), "appimage artifact");
  await writeFile(join(workspaceRoot, "proof", "bevy-tar-report.json"), JSON.stringify(packageReport("bevy", "tar")));
  await writeFile(join(workspaceRoot, "proof", "bevy-appimage-report.json"), JSON.stringify(packageReport("bevy", "appimage")));
  await writeFile(join(workspaceRoot, "proof", "webview-tar-report.json"), JSON.stringify(packageReport("webview", "tar")));
  await writeFile(join(workspaceRoot, "proof", "webview-appimage-report.json"), JSON.stringify(packageReport("webview", "appimage")));

  const registry = [
    row("linux", "bevy", "implemented"),
    row("linux", "webview", "implemented"),
    row("windows", "bevy", "planned"),
  ];
  const valid = proofRow("bevy");

  await assert.rejects(
    verifyDesktopDistribution({ lifecycle: "implemented", registry, rows: [valid], workspaceRoot }),
    /linux\/webview:missing-report/,
  );
  await assert.doesNotReject(verifyDesktopDistribution({
    lifecycle: "implemented",
    registry,
    rows: [valid, proofRow("webview")],
    workspaceRoot,
  }));
  await assert.rejects(verifyDesktopDistribution({
    lifecycle: "implemented",
    registry: [row("linux", "bevy", "implemented")],
    rows: [{ ...valid, launchEvidence: "proof/missing.png" }],
    workspaceRoot,
  }), /launch-evidence:missing-file/);
  await assert.rejects(verifyDesktopDistribution({
    lifecycle: "implemented",
    registry: [row("linux", "bevy", "implemented")],
    rows: [{ ...valid, formats: { ...valid.formats, tar: { ...valid.formats.tar, sha256: "a".repeat(64) } } }],
    workspaceRoot,
  }), /tar:hash-mismatch/);
  await writeFile(join(workspaceRoot, "proof", "bevy-tar-report.json"), JSON.stringify({
    ...packageReport("bevy", "tar"),
    artifact: { bytes: 12, path: "game.tar.gz", sha256: "b".repeat(64) },
  }));
  await assert.rejects(verifyDesktopDistribution({
    lifecycle: "implemented",
    registry: [row("linux", "bevy", "implemented")],
    rows: [valid],
    workspaceRoot,
  }), /tar:package-report:artifact-hash/);
});

function proofRow(runtime) {
  const tarHash = hash("tar artifact");
  const appImageHash = hash("appimage artifact");
  return {
    artifactSha256: appImageHash,
    formats: {
      appimage: { bytes: 17, packageReport: `proof/${runtime}-appimage-report.json`, path: "proof/game.AppImage", sha256: appImageHash },
      tar: { bytes: 12, packageReport: `proof/${runtime}-tar-report.json`, path: "proof/game.tar.gz", repeatSha256: tarHash, sha256: tarHash },
    },
    host: "linux",
    launchEvidence: "proof/launch.png",
    platform: "linux",
    proof: {
      input: "passed",
      inputAction: "clicked Play",
      requirements: {
        "embedded-webview": "passed",
        "first-frame": "passed",
        input: "passed",
        launch: "passed",
        "local-assets": "passed",
        "native-host-install": "passed",
      },
    },
    runtime,
    signingStatus: "not-applicable",
  };
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function row(platform, runtime, promotion) {
  return {
    architectures: ["x86_64"],
    eligibleHosts: [platform],
    formats: ["tar", "appimage"],
    platform,
    promotion,
    proofRequirements: ["native-host-install", ...(runtime === "webview" ? ["embedded-webview"] : []), "launch", "first-frame", "input", "local-assets"],
    runtime,
    signable: false,
  };
}

function packageReport(runtime, format) {
  const content = format === "tar" ? "tar artifact" : "appimage artifact";
  return {
    architecture: "x86_64",
    artifact: {
      bytes: content.length,
      path: format === "tar" ? "game.tar.gz" : "game.AppImage",
      sha256: hash(content),
    },
    format,
    platform: "linux",
    runtime,
    schema: "threenative.package-report",
    signing: { status: "not-applicable" },
    sourceHash: "a".repeat(64),
    toolchain: { test: true },
    version: "0.1.0",
  };
}
