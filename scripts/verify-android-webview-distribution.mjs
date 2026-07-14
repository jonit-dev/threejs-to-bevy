import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

const REQUIRED_MOMENTS = [
  "install",
  "launch",
  "firstFrame",
  "touch",
  "back",
  "resizeOrientation",
  "pauseResume",
  "persistence",
  "audioLifecycle",
  "safeArea",
  "localAssets",
];

export async function verifyAndroidWebviewDistribution({ proof, workspaceRoot = process.cwd(), requirePhysical = true }) {
  const diagnostics = [];
  const requiredClasses = requirePhysical ? ["emulator", "physical"] : ["emulator"];
  const byClass = new Map((proof.devices ?? []).map((device) => [device.class, device]));
  for (const deviceClass of requiredClasses) {
    const device = byClass.get(deviceClass);
    if (device === undefined) {
      diagnostics.push(`${deviceClass}:missing-report`);
      continue;
    }
    for (const moment of REQUIRED_MOMENTS) {
      if (device.proof?.[moment] !== "passed") {
        diagnostics.push(`${deviceClass}:${moment}`);
      } else {
        await verifyEvidence(device.evidence?.[moment], `${deviceClass}:${moment}:evidence`, workspaceRoot, diagnostics);
      }
    }
    for (const metadata of ["api", "gpu", "model", "os", "webviewVersion"]) {
      if (typeof device[metadata] !== "string" || device[metadata].length === 0) diagnostics.push(`${deviceClass}:metadata:${metadata}`);
    }
    await verifyEvidence(device.screenshot, `${deviceClass}:screenshot`, workspaceRoot, diagnostics);
  }
  await verifyArtifact(proof.artifact, workspaceRoot, diagnostics);
  if (diagnostics.length > 0) throw new Error(`Android webview distribution verification failed: ${diagnostics.join(", ")}`);
  return {
    code: "TN_VERIFY_ANDROID_WEBVIEW_DISTRIBUTION_OK",
    deviceClasses: requiredClasses,
    schema: "threenative.android-webview-verification",
    version: "0.1.0",
  };
}

async function verifyArtifact(artifact, workspaceRoot, diagnostics) {
  if (artifact === null || typeof artifact !== "object") {
    diagnostics.push("artifact:missing");
    return;
  }
  const path = resolve(workspaceRoot, artifact.path ?? "");
  try {
    const file = await stat(path);
    if (file.size !== artifact.bytes) diagnostics.push("artifact:bytes");
    if (await sha256File(path) !== artifact.sha256) diagnostics.push("artifact:hash");
  } catch (error) {
    if (error?.code === "ENOENT") diagnostics.push("artifact:missing-file");
    else throw error;
  }
  if (artifact.signingStatus !== "signed" && artifact.format === "aab") diagnostics.push("artifact:signing");
}

async function verifyEvidence(path, diagnostic, workspaceRoot, diagnostics) {
  if (typeof path !== "string" || path.length === 0) {
    diagnostics.push(diagnostic);
    return;
  }
  try {
    if (!(await stat(resolve(workspaceRoot, path))).isFile()) diagnostics.push(`${diagnostic}:not-file`);
  } catch (error) {
    if (error?.code === "ENOENT") diagnostics.push(`${diagnostic}:missing-file`);
    else throw error;
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const input = flagValue("--input");
  if (input === undefined) throw new Error("Usage: node scripts/verify-android-webview-distribution.mjs --input <proof.json> [--emulator-only]");
  const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
  const proof = JSON.parse(await readFile(resolve(input), "utf8"));
  const report = await verifyAndroidWebviewDistribution({ proof, requirePhysical: !process.argv.includes("--emulator-only"), workspaceRoot: root });
  const output = resolveArtifactTargets({
    gate: "distribution-android-webview",
    owner: { kind: "aggregate", name: "distribution/android/webview" },
    root,
  }).reportPath;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Android webview distribution gate passed. Report: ${output}\n`);
}

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
