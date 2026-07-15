import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dynamicId = "proof.box-on-bush";
const characterId = "proof.character-on-arch";

export async function verifyProceduralMeshPhysics(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/procedural-mesh/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/procedural-mesh");
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  const web = {
    character: runtime.traceCharacterControllers(structuredClone(bundle.world), { axes: {}, fixedDelta: 1 }),
    fixedDelta: 0.1,
    rigidBodies: runtime.traceRigidBodyPrimitive(structuredClone(bundle.world), { fixedDelta: 0.1, steps: 12 }),
    runtime: "web",
  };

  await mkdir(artifactDir, { recursive: true });
  const webPath = resolve(artifactDir, "physics-web.json");
  const nativeRigidPath = resolve(artifactDir, "physics-native-rigid.json");
  const nativeCharacterPath = resolve(artifactDir, "physics-native-character.json");
  const reportPath = resolve(artifactDir, "physics-report.json");
  await writeJson(webPath, web);

  const rigidCommand = runNative(root, bundlePath, "procedural-mesh-derived-colliders", nativeRigidPath);
  const characterCommand = runNative(root, bundlePath, "physics-character-obstacles", nativeCharacterPath);
  if (!rigidCommand.ok || !characterCommand.ok) {
    const report = await writeReport(reportPath, {
      commands: [rigidCommand, characterCommand],
      diagnostics: ["native procedural collider trace failed"],
      status: "fail",
    });
    return { ...report, ok: false, reportPath };
  }

  const nativeRigid = JSON.parse(await readFile(nativeRigidPath, "utf8"));
  const nativeCharacter = JSON.parse(await readFile(nativeCharacterPath, "utf8"));
  const checks = [
    ...restChecks("web", web.rigidBodies),
    ...restChecks("bevy", nativeRigid.rigidBodies),
    ...groundChecks("web", web.character),
    ...groundChecks("bevy", nativeCharacter.character),
    parityCheck("rigid body traces", web.rigidBodies, nativeRigid.rigidBodies),
    parityCheck("character traces", web.character, nativeCharacter.character),
  ];
  const ok = checks.every((check) => check.status === "pass");
  const report = await writeReport(reportPath, {
    artifacts: { nativeCharacterPath, nativeRigidPath, reportPath, webPath },
    checks,
    commands: [rigidCommand, characterCommand],
    diagnostics: checks.filter((check) => check.status === "fail").map((check) => check.message),
    status: ok ? "pass" : "fail",
  });
  return { ...report, ok, reportPath };
}

function runNative(root, bundlePath, sceneId, outputPath) {
  const args = ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_physics_self_verification_trace", "--", bundlePath, sceneId, outputPath];
  const result = spawnSync("cargo", args, { cwd: resolve(root, "runtime-bevy"), encoding: "utf8", timeout: 180_000 });
  return {
    command: `cargo ${args.join(" ")}`,
    ok: result.status === 0,
    status: result.status,
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
  };
}

function restChecks(runtime, observations) {
  const body = observations.filter((observation) => observation.entity === dynamicId);
  const last = body.at(-1);
  return [
    check(`${runtime} generated box contact`, body.some((observation) => observation.contact === "prop.bush"), `${runtime} trace did not contact prop.bush`),
    check(`${runtime} dropped body rests`, last?.contact === "prop.bush" && Math.abs(last.velocity[1]) <= 0.00001 && last.position[1] > 0.57, `${runtime} final dropped-body observation is not resting on prop.bush`),
  ];
}

function groundChecks(runtime, observations) {
  const character = observations.find((observation) => observation.entity === characterId);
  return [
    check(`${runtime} CSG mesh grounding`, character?.grounded === true && character.groundEntity === "prop.arch", `${runtime} capsule is not grounded on prop.arch`),
    check(`${runtime} capsule rests above arch`, (character?.resolved?.[1] ?? 0) >= 2.8999, `${runtime} capsule resolved below the CSG arch top`),
  ];
}

function parityCheck(name, web, native) {
  return check(`${name} parity`, JSON.stringify(normalize(web)) === JSON.stringify(normalize(native)), `${name} differ between web and Bevy`);
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Math.round(item * 10_000) / 10_000 : item));
}

function check(name, condition, message) {
  return { message: condition ? name : message, name, status: condition ? "pass" : "fail" };
}

async function writeReport(path, value) {
  const report = {
    generatedBy: "scripts/verify-procedural-mesh-physics.mjs",
    schema: "threenative.procedural-mesh-physics-verification",
    version: "0.1.0",
    ...value,
  };
  await writeJson(path, report);
  return report;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyProceduralMeshPhysics();
  process.stdout.write(`${JSON.stringify({ reportPath: result.reportPath, status: result.status }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
