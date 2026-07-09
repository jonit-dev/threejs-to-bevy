import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceCharacterControllers } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/character-physics-contacts/game.bundle");
const targets = resolveArtifactTargets({ gate: "character-physics-contacts", owner: { kind: "aggregate", name: "character-physics-contacts" }, root });
const artifactRoot = targets.absoluteDir;
const nativeReportPath = resolve(artifactRoot, "native-character.json");
const webReportPath = resolve(artifactRoot, "web-character.json");
const numericPrecision = 100_000;

await mkdir(artifactRoot, { recursive: true });

const validation = await validateBundle(fixture);
if (!validation.ok) {
  await writeReport({ diagnostics: validation.diagnostics, ok: false, reason: "fixture validation failed", status: "failed" });
  process.exitCode = 1;
} else {
  const bundle = await loadBundle(fixture);
  const axes = { MoveX: 1, MoveZ: 0 };
  const web = {
    observations: [
      ...traceCharacterControllers(bundle.world, { axes, fixedDelta: 1 }),
      ...traceCharacterControllers(bundle.world, { axes, direction: [0, 1], fixedDelta: 0.5, speed: 6 }),
    ],
    schema: "threenative.character-trace",
    version: "0.1.0",
  };
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_character_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });
  const commands = [
    { command: "validateBundle(character-physics-contacts)", status: "pass" },
    { command: "cargo run -p threenative_runtime --bin threenative_character_trace -- <fixture> <artifact>", status: native.status === 0 ? "pass" : "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
  ];
  if (native.status !== 0) {
    await writeReport({ commands, ok: false, reason: "native character trace failed", status: "failed" });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareTrace(web, nativeJson);
    await writeJson(resolve(artifactRoot, "diff.json"), diff);
    await writeReport({
      artifacts: {
        diff: "tools/verify/artifacts/character-physics-contacts/diff.json",
        native: "tools/verify/artifacts/character-physics-contacts/native-character.json",
        report: "tools/verify/artifacts/character-physics-contacts/verification-report.json",
        web: "tools/verify/artifacts/character-physics-contacts/web-character.json",
      },
      commands,
      comparison: diff,
      ok: diff.ok,
      promoted: ["character contact filtering", "character slope observations", "character push observations"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { numeric: 0.00001, ordering: "phase, self entity id, other entity id, point index" },
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

function compareTrace(web, native) {
  const left = normalize(web.observations);
  const right = normalize(native.observations);
  return JSON.stringify(left) === JSON.stringify(right)
    ? { mismatches: [], ok: true }
    : { mismatches: [{ key: "observations", native: right, web: left }], ok: false };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Math.round(item * numericPrecision) / numericPrecision : item));
}

async function writeReport(report) {
  await writeJson(targets.reportPath, {
    generatedBy: "scripts/verify-character-physics-contacts.mjs",
    prd: "docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-013-portable-scripting-character-physics-contacts.md",
    schema: "threenative.character-physics-contacts-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
