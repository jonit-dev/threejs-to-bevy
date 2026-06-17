import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceCharacterControllers, traceNavigationPaths, tracePhysicsSensors, traceRigidBodyPrimitive } from "../packages/runtime-web-three/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/v9-physics-character/game.bundle");
const artifactRoot = resolve(root, "artifacts/conformance/v9-physics-character");
const nativeReport = resolve(artifactRoot, "native-v9-physics-character.json");

async function main() {
  await mkdir(artifactRoot, { recursive: true });
  const bundleValidation = await validateBundle(fixture);
  if (!bundleValidation.ok) {
    await writeReport({ status: "failed", reason: "accepted fixture validation failed", diagnostics: bundleValidation.diagnostics });
    process.exitCode = 1;
    return;
  }

  const bundle = await loadBundle(fixture);
  const web = {
    schema: "threenative.v9-physics-character-trace",
    version: "0.1.0",
    character: traceCharacterControllers(bundle.world, { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta: 1 }),
    navigation: traceNavigationPaths(bundle.world),
    sensors: tracePhysicsSensors(bundle.world, { fixedDelta: 1, steps: 3 }),
    solver: traceRigidBodyPrimitive(bundle.world, { fixedDelta: 0.25, steps: 4 }),
  };
  await writeJson(resolve(artifactRoot, "web-v9-physics-character.json"), web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_v9_physics_character_trace", "--", fixture, nativeReport], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });
  const commands = [
    { command: "validateBundle(packages/ir/fixtures/conformance/v9-physics-character/game.bundle)", status: "pass" },
    { command: "cargo run -p threenative_runtime --bin threenative_v9_physics_character_trace -- <fixture> <artifact>", status: native.status === 0 ? "pass" : "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
  ];
  if (native.status !== 0) {
    await writeReport({ status: "failed", reason: "native trace command failed", commands });
    process.exitCode = 1;
    return;
  }
  const nativeJson = JSON.parse(await readFile(nativeReport, "utf8"));
  const diff = compareTrace(web, nativeJson);
  await writeJson(resolve(artifactRoot, "diff-v9-physics-character.json"), diff);
  await writeReport({
    status: diff.ok ? "passed" : "failed",
    commands,
    artifacts: {
      diff: "artifacts/conformance/v9-physics-character/diff-v9-physics-character.json",
      native: "artifacts/conformance/v9-physics-character/native-v9-physics-character.json",
      web: "artifacts/conformance/v9-physics-character/web-v9-physics-character.json",
    },
    promoted: ["primitive-solver-v2", "broad-sensors", "character-push", "static-navigation", "backend-boundary-diagnostics"],
    deferred: ["dynamic-mesh-colliders", "joints-constraints", "dynamic-navmesh-rebake", "crowd-steering", "backend-public-handles"],
    tolerance: { numeric: 0.000001, ordering: "stable entity ids and phase/type order" },
  });
  if (!diff.ok) {
    process.exitCode = 1;
  }
}

function compareTrace(web, native) {
  const mismatches = [];
  for (const key of ["solver", "sensors", "character", "navigation"]) {
    const left = normalize(web[key]);
    const right = normalize(native[key]);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      mismatches.push({ key, web: left, native: right });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Math.round(item * 1_000_000) / 1_000_000 : item));
}

async function writeReport(report) {
  await writeJson(resolve(artifactRoot, "verification-report.json"), {
    generatedBy: "scripts/verify-v9-physics-character.mjs",
    prd: "docs/PRDs/v9/V9-02-physics-character-runtime-parity.md",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

await main();
