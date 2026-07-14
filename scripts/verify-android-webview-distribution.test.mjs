import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyAndroidWebviewDistribution } from "./verify-android-webview-distribution.mjs";

test("should fail when install launch or resume evidence is missing", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "tn-android-proof-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(join(root, "proof"));
  await writeFile(join(root, "proof", "game.apk"), "apk");
  await writeFile(join(root, "proof", "screen.png"), "screen");
  const proof = validProof();

  await assert.doesNotReject(verifyAndroidWebviewDistribution({ proof, requirePhysical: false, workspaceRoot: root }));
  for (const moment of ["install", "launch", "pauseResume"]) {
    const invalid = structuredClone(proof);
    delete invalid.devices[0].proof[moment];
    await assert.rejects(
      verifyAndroidWebviewDistribution({ proof: invalid, requirePhysical: false, workspaceRoot: root }),
      new RegExp(`emulator:${moment}`),
    );
  }
  const missingEvidence = structuredClone(proof);
  delete missingEvidence.devices[0].evidence.touch;
  await assert.rejects(
    verifyAndroidWebviewDistribution({ proof: missingEvidence, requirePhysical: false, workspaceRoot: root }),
    /emulator:touch:evidence/,
  );
  await assert.rejects(verifyAndroidWebviewDistribution({ proof, requirePhysical: true, workspaceRoot: root }), /physical:missing-report/);
});

function validProof() {
  const momentNames = [
    "install", "launch", "firstFrame", "touch", "back", "resizeOrientation", "pauseResume", "persistence", "audioLifecycle", "safeArea", "localAssets",
  ];
  const moments = Object.fromEntries(momentNames.map((name) => [name, "passed"]));
  return {
    artifact: {
      bytes: 3,
      format: "apk",
      path: "proof/game.apk",
      sha256: createHash("sha256").update("apk").digest("hex"),
      signingStatus: "unsigned",
    },
    devices: [{
      api: "35",
      class: "emulator",
      evidence: Object.fromEntries(momentNames.map((name) => [name, "proof/screen.png"])),
      gpu: "swiftshader_indirect",
      model: "ThreeNative_API_35",
      os: "Android 15",
      proof: moments,
      screenshot: "proof/screen.png",
      webviewVersion: "136.0",
    }],
  };
}
