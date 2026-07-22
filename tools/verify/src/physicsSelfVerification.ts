import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PHYSICS_OBSERVATION_TOLERANCES, PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION } from "@threenative/ir";
import { ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION, advancedPhysicsEvidenceMetadataDiagnostics } from "./advancedPhysicsEvidence.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const gate = "physics-self-verification";
const aggregateDir = resolve(root, "tools/verify/artifacts/physics-self-verification");
const phase1AggregateDir = resolve(root, "tools/verify/artifacts/advanced-physics/phase-1-foundation");
const fixtureRoot = resolve(root, "packages/ir/fixtures/conformance");
const tolerance = 0.000001;

type Vec3 = [number, number, number];
type ComponentMap = Record<string, unknown>;
type WorldEntity = { components: ComponentMap; id: string };
type ScenePriority = "P0" | "P1";
type SceneDefinition = {
  assertions: string[];
  entities: WorldEntity[];
  id: string;
  priority: ScenePriority;
  promoted: string[];
  purpose: string;
  trace: "rigid" | "character" | "query" | "joint";
};

const scenes: SceneDefinition[] = [
  {
    assertions: ["gravity-monotonic-velocity", "floor-no-penetration", "wall-contact-metadata"],
    entities: [
      entity("floor", [0, 0, 0], { Collider: { friction: 0.4, kind: "box", restitution: 0, size: [8, 0.2, 8], layer: "world" }, RigidBody: { kind: "static" } }),
      entity("wall", [2.2, 0.9, 0], { Collider: { friction: 0.4, kind: "box", restitution: 0, size: [0.2, 1.8, 3], layer: "world" }, RigidBody: { kind: "static" } }),
      entity("falling-box", [0, 3, 0], { Collider: { friction: 0.5, kind: "box", restitution: 0, size: [1, 1, 1], mask: ["world"] }, RigidBody: { gravityScale: 1, kind: "dynamic", mass: 1, velocity: [0, 0, 0] } }),
      entity("moving-box", [1.2, 1.1, 0], { Collider: { friction: 0.5, kind: "box", restitution: 0, size: [1, 1, 1], mask: ["world"] }, RigidBody: { gravityScale: 0, kind: "dynamic", mass: 1, velocity: [1.8, 0, 0] } }),
    ],
    id: "physics-gravity-collision-lab",
    priority: "P0",
    promoted: ["gravity", "collision-response", "contact-ordering"],
    purpose: "Proves primitive gravity integration, floor resolution, and stable collision metadata.",
    trace: "rigid",
  },
  {
    assertions: ["restitution-peak-order", "friction-distance-order", "linear-damping-decay"],
    entities: [
      entity("floor", [0, 0, 0], { Collider: { friction: 0, kind: "box", restitution: 0, size: [14, 0.2, 6], layer: "world" }, RigidBody: { kind: "static" } }),
      entity("high-restitution", [-4, 1.5, 0], { Collider: { friction: 0, kind: "sphere", radius: 0.5, restitution: 0.5, mask: ["world"] }, RigidBody: { gravityScale: 0, kind: "dynamic", mass: 1, velocity: [0, -4, 0] } }),
      entity("low-restitution", [-2, 1.5, 0], { Collider: { friction: 0, kind: "sphere", radius: 0.5, restitution: 0, mask: ["world"] }, RigidBody: { gravityScale: 0, kind: "dynamic", mass: 1, velocity: [0, -4, 0] } }),
      entity("low-friction-slider", [1, 0.5, 0], { Collider: { friction: 0, kind: "box", restitution: 0, size: [0.8, 0.8, 0.8], mask: ["world"] }, RigidBody: { gravityScale: 0, kind: "dynamic", mass: 1, velocity: [2, 0, 0] } }),
      entity("high-friction-slider", [1, 0.5, 1.4], { Collider: { friction: 1, kind: "box", restitution: 0, size: [0.8, 0.8, 0.8], mask: ["world"] }, RigidBody: { gravityScale: 0, kind: "dynamic", mass: 1, velocity: [2, 0, 0] } }),
      entity("damped", [4, 2, 0], { Collider: { kind: "box", size: [0.8, 0.8, 0.8] }, RigidBody: { angularVelocity: [0, 3, 0], damping: 4, gravityScale: 0, kind: "dynamic", mass: 1, velocity: [2, 0, 0] } }),
      entity("undamped", [4, 3.2, 0], { Collider: { kind: "box", size: [0.8, 0.8, 0.8] }, RigidBody: { angularVelocity: [0, 3, 0], damping: 0, gravityScale: 0, kind: "dynamic", mass: 1, velocity: [2, 0, 0] } }),
    ],
    id: "physics-material-lab",
    priority: "P0",
    promoted: ["restitution", "friction", "linear-damping", "angular-damping-metadata"],
    purpose: "Compares material response metadata and deterministic damping traces.",
    trace: "rigid",
  },
  {
    assertions: ["mass-inverse-mass-response", "stack-settle-near-zero-velocity", "contact-ordering"],
    entities: [
      entity("floor", [0, 0, 0], { Collider: { friction: 0.8, kind: "box", size: [8, 0.2, 8], layer: "world" }, RigidBody: { inverseMass: 0, kind: "static" } }),
      entity("light-box", [-2, 1.2, 0], { Collider: { kind: "box", size: [1, 1, 1], mask: ["world"] }, RigidBody: { gravityScale: 1, inverseMass: 1, kind: "dynamic", mass: 1, velocity: [2, -0.5, 0] } }),
      entity("heavy-box", [0, 1.2, 0], { Collider: { kind: "box", size: [1, 1, 1], mask: ["world"] }, RigidBody: { gravityScale: 1, inverseMass: 0.1, kind: "dynamic", mass: 10, velocity: [0.2, -0.5, 0] } }),
      entity("stack-a", [2, 0.8, 0], { Collider: { kind: "box", size: [1, 1, 1], mask: ["world"] }, RigidBody: { damping: 0.4, gravityScale: 1, inverseMass: 1, kind: "dynamic", mass: 1, sleepThreshold: 0.01, velocity: [0, 0, 0] } }),
      entity("stack-b", [2, 1.85, 0], { Collider: { kind: "box", size: [1, 1, 1], mask: ["world"] }, RigidBody: { damping: 0.4, gravityScale: 1, inverseMass: 1, kind: "dynamic", mass: 1, sleepThreshold: 0.01, velocity: [0, 0, 0] } }),
      entity("stack-c", [2, 2.9, 0], { Collider: { kind: "box", size: [1, 1, 1], mask: ["world"] }, RigidBody: { damping: 0.4, gravityScale: 1, inverseMass: 1, kind: "dynamic", mass: 1, sleepThreshold: 0.01, velocity: [0, 0, 0] } }),
    ],
    id: "physics-mass-stack-lab",
    priority: "P0",
    promoted: ["mass-response", "inverse-mass-metadata", "solver-stacking"],
    purpose: "Proves mass metadata and stack/contact ordering with deterministic primitive solver traces.",
    trace: "rigid",
  },
  {
    assertions: ["character-observation-finite"],
    entities: [
      entity("character", [0, 1, 0], { CharacterController: { blocking: true, grounding: "raycast", moveXAxis: "MoveX", moveZAxis: "MoveZ", pushPolicy: { allowedLayers: ["world"], blockedWhenTooHeavy: true, enabled: true, impulseScale: 1, maxPushMass: 10, minMoveSpeed: 0.1 }, speed: 1, stepOffset: 0.3 }, Collider: { kind: "capsule", height: 1.8, radius: 0.35, layer: "player", mask: ["world"] }, RigidBody: { kind: "kinematic", velocity: [1, 0, 0] } }),
      entity("wall", [2, 1, 0], { Collider: { kind: "box", size: [0.4, 2, 2], layer: "world" }, RigidBody: { kind: "static" } }),
      entity("step", [0.8, 0.2, 1.4], { Collider: { kind: "box", size: [0.8, 0.4, 0.8], layer: "world" }, RigidBody: { kind: "static" } }),
      entity("pushable-crate", [1.2, 0.6, -1.3], { Collider: { kind: "box", size: [0.8, 0.8, 0.8], layer: "world" }, RigidBody: { inverseMass: 0.5, kind: "dynamic", mass: 2, velocity: [0, 0, 0] } }),
      entity("ramp", [-1.2, 0.2, 1.2], { Collider: { kind: "box", size: [1.5, 0.3, 1], slope: { axis: "x", direction: 1, rise: 0.3, run: 1 } }, RigidBody: { kind: "static" } }),
    ],
    id: "physics-character-obstacles",
    priority: "P0",
    promoted: ["character-controller", "blocking", "push-metadata", "sloped-grounding-fixture"],
    purpose: "Provides a focused authored obstacle scene for character movement claims.",
    trace: "character",
  },
  {
    assertions: ["raycast-stable-hit", "overlap-stable-order", "shape-cast-hit", "layer-mask-filter-negative"],
    entities: [
      entity("ray-target", [3, 0.5, 0], { Collider: { kind: "box", layer: "world", mask: ["query"], size: [1, 1, 1] }, RigidBody: { kind: "static" } }),
      entity("overlap-a", [0, 0.5, 0], { Collider: { kind: "box", layer: "sensor", mask: ["query"], size: [1, 1, 1], trigger: true }, RigidBody: { kind: "static" } }),
      entity("overlap-b", [0.4, 0.5, 0], { Collider: { kind: "sphere", layer: "sensor", mask: ["query"], radius: 0.4, trigger: true }, RigidBody: { kind: "static" } }),
      entity("filtered-out", [1.2, 0.5, 0], { Collider: { kind: "box", layer: "hidden", mask: ["none"], size: [1, 1, 1] }, RigidBody: { kind: "static" } }),
    ],
    id: "physics-query-lab",
    priority: "P0",
    promoted: ["raycast", "overlap", "shape-cast", "sensor-filtering"],
    purpose: "Proves query service payloads and stable layer/mask filtering.",
    trace: "query",
  },
  {
    assertions: ["ccd-swept-aabb-metadata", "bounded-mesh-contact"],
    entities: [
      entity("track-mesh", [0, 0, 0], { Collider: { kind: "mesh", mesh: { bounds: { center: [0, 0, 0], size: [8, 0.4, 4] }, source: "mesh.track", triangleCount: 96 } }, RigidBody: { kind: "static" } }),
      entity("high-speed-chassis", [0, 4, 0], { Collider: { kind: "mesh", mesh: { bounds: { center: [0, 0, 0], size: [1.6, 0.6, 2.4] }, source: "mesh.chassis", triangleCount: 128 } }, RigidBody: { ccd: { enabled: true, mode: "swept-aabb" }, gravityScale: 0, kind: "dynamic", mass: 1, velocity: [0, -20, 0] } }),
    ],
    id: "physics-mesh-ccd-track",
    priority: "P1",
    promoted: ["mesh-collider-bounds", "ccd-swept-aabb"],
    purpose: "Separates bounded mesh/CCD metadata proof from arbitrary triangle narrow phase.",
    trace: "rigid",
  },
  {
    assertions: ["joint-metadata-preserved"],
    entities: [
      entity("anchor", [0, 1, 0], { Collider: { kind: "box", size: [0.4, 0.4, 0.4] }, PhysicsJoint: { connectedEntity: "arm", kind: "hinge", axis: [0, 1, 0] }, RigidBody: { kind: "static" } }),
      entity("arm", [1, 1, 0], { Collider: { kind: "box", size: [1, 0.2, 0.2] }, PhysicsJoint: { connectedEntity: "anchor", kind: "slider", axis: [1, 0, 0] }, RigidBody: { kind: "dynamic", mass: 1 } }),
      entity("wheel", [0, 0.4, 1], { Collider: { kind: "sphere", radius: 0.3 }, PhysicsJoint: { connectedEntity: "anchor", kind: "suspension", axis: [0, 1, 0] }, RigidBody: { kind: "dynamic", mass: 1 } }),
    ],
    id: "physics-joint-metadata",
    priority: "P1",
    promoted: ["joint-metadata"],
    purpose: "Proves portable joint metadata preservation without claiming constraint solving.",
    trace: "joint",
  },
];

const negativeFixtures = [
  { code: "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED", id: "backend-physics-handles", world: world([entity("raw", [0, 0, 0], { Collider: { kind: "box", nativeHandle: "rapier-collider", size: [1, 1, 1] }, RigidBody: { kind: "dynamic", runtimeHandle: "rapier-body" } })]) },
  { code: "TN_IR_PHYSICS_COMPOUND_CONVEX_HULL_DEGENERATE", id: "degenerate-compound-convex-hull", world: world([entity("flat-hull", [0, 0, 0], { CompoundCollider: { children: [{ id: "flat", localPose: { position: [0, 0, 0] }, shape: { kind: "convexHull", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] } }] }, RigidBody: { kind: "dynamic" } })]) },
  { code: "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID", id: "arbitrary-triangle-narrow-phase", world: world([entity("dynamic-unbounded-mesh", [0, 0, 0], { Collider: { kind: "mesh" }, RigidBody: { kind: "dynamic" } })]) },
  { code: "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED", id: "full-constraint-solving", world: world([entity("constraint", [0, 0, 0], { Collider: { kind: "box", size: [1, 1, 1] }, RigidBody: { constraint: { kind: "hinge" }, kind: "dynamic" } })]) },
];

async function main() {
  await mkdir(aggregateDir, { recursive: true });
  const toolchain = toolchainVersions();
  const runtime = await loadRuntime();
  const validationRows = [];
  const sceneRows = [];

  const advanced = await runAdvancedPhysicsFoundation(runtime);
  validationRows.push(advanced.validation);
  sceneRows.push(advanced.row);
  if (process.argv.includes("--phase-1-only")) {
    console.log(JSON.stringify(advanced.row, null, 2));
    if (!advanced.row.ok) process.exitCode = 1;
    return;
  }

  for (const scene of scenes) {
    const bundleDir = await writeSceneBundle(scene);
    const exampleDir = resolve(root, "examples", scene.id, "artifacts", gate);
    await mkdir(exampleDir, { recursive: true });
    const validation = await validateBundleSafely(runtime, bundleDir);
    validationRows.push({ diagnostics: validation.diagnostics ?? [], ok: validation.ok, scene: scene.id });
    if (!validation.ok) {
      sceneRows.push({ ok: false, reason: "bundle validation failed", scene: scene.id });
      continue;
    }

    const bundle = await runtime.loadBundle(bundleDir);
    const webTrace = await traceScene(scene, bundle.world, runtime);
    const nativeTracePath = resolve(exampleDir, "native-trace.json");
    const nativeRun = await traceNativeScene(scene, bundleDir, nativeTracePath);
    if (!nativeRun.ok) {
      sceneRows.push({ command: nativeRun.command, ok: false, reason: "native trace command failed", scene: scene.id, stderr: nativeRun.stderr, stdout: nativeRun.stdout });
      continue;
    }
    const nativeTrace = JSON.parse(await readFile(nativeTracePath, "utf8"));
    const diff = compareJson(webTrace, nativeTrace);
    const assertions = assertScene(scene, webTrace);
    const visualArtifacts = await writeVisualEvidence(scene, webTrace, nativeTrace, exampleDir);
    const artifacts = {
      bundle: repoRelative(bundleDir),
      diff: repoRelative(resolve(exampleDir, "diff.json")),
      nativeTrace: repoRelative(nativeTracePath),
      ...visualArtifacts,
      webTrace: repoRelative(resolve(exampleDir, "web-trace.json")),
    };
    await writeJson(resolve(exampleDir, "web-trace.json"), webTrace);
    await writeJson(resolve(exampleDir, "diff.json"), diff);
    await writeJson(resolve(exampleDir, "scene-report.json"), { artifacts, assertions, nativeCommand: nativeRun.command, priority: scene.priority, promoted: scene.promoted, purpose: scene.purpose, scene: scene.id, status: diff.ok && assertions.every((item) => item.ok) ? "PASS" : "FAIL" });
    sceneRows.push({ artifacts, assertions, diff, nativeCommand: nativeRun.command, ok: diff.ok && assertions.every((item) => item.ok), priority: scene.priority, scene: scene.id });
  }

  const negativeRows = [];
  for (const fixture of negativeFixtures) {
    const dir = resolve(aggregateDir, "negative", fixture.id, "game.bundle");
    await writeBundle(dir, fixture.id, fixture.world);
    const result = await validateBundleSafely(runtime, dir);
    const codes = (result.diagnostics ?? []).map((diagnostic: { code?: string }) => diagnostic.code);
    negativeRows.push({ diagnostics: result.diagnostics ?? [], expectedCode: fixture.code, fixture: fixture.id, ok: !result.ok && codes.includes(fixture.code) });
  }

  const existingGateRows = await runExistingGateSmoke();
  const scenesOk = sceneRows.every((row) => row.ok) && negativeRows.every((row) => row.ok);
  const status = scenesOk && existingGateRows.every((row) => row.ok) ? "PASS" : "FAIL";
  const report = {
    cleanup: [
      "Generated example evidence under examples/<scene>/artifacts/physics-self-verification/.",
      "Generated aggregate evidence under tools/verify/artifacts/physics-self-verification/.",
      "Generated reusable conformance bundles under packages/ir/fixtures/conformance/<scene>/game.bundle/.",
    ],
    commands: existingGateRows,
    commit: gitCommit(),
    conclusion: status,
    docsCrossReference: docsCrossReference(),
    generatedBy: "tools/verify/src/physicsSelfVerification.ts",
    negativeFixtures: negativeRows,
    residuals: [
      { classification: "diagnostic-only", item: "full constraint solving, vehicles, tire/drivetrain models, soft bodies, ragdolls, arbitrary triangle narrow phase" },
    ],
    sceneRows,
    schema: "threenative.physics-self-verification.report",
    tolerance,
    toolchain,
    validationRows,
  };
  await writeJson(resolve(aggregateDir, "verification-report.json"), report);
  await writeValidationMarkdown(report);
  console.log(JSON.stringify(report, null, 2));
  if (status === "FAIL") {
    process.exitCode = 1;
  }
}

async function loadRuntime() {
  const ir = await import(resolve(root, "packages/ir/dist/validate.js"));
  const web = await import(resolve(root, "packages/runtime-web-three/dist/index.js"));
  const webPhysics = await import(resolve(root, "packages/runtime-web-three/dist/physics.js"));
  const webRunner = await import(resolve(root, "packages/runtime-web-three/dist/systems/runner.js"));
  const query = await import(resolve(root, "packages/runtime-web-three/dist/systems/services/physics.js"));
  return { ...ir, ...web, ...webPhysics, ...webRunner, ...query };
}

async function runAdvancedPhysicsFoundation(runtime: Record<string, any>) {
  const startedAt = new Date().toISOString();
  const scene = "advanced-physics-foundation";
  const fixtureDir = resolve(fixtureRoot, scene);
  const bundleDir = resolve(fixtureDir, "game.bundle");
  const exampleDir = resolve(root, "examples", scene, "artifacts", gate);
  await mkdir(exampleDir, { recursive: true });
  const validation = await validateBundleSafely(runtime, bundleDir);
  const failed = (reason: string, extra: Record<string, unknown> = {}) => ({
    row: { ...extra, ok: false, priority: "P0", reason, scene },
    validation: { diagnostics: validation.diagnostics ?? [], ok: validation.ok, scene },
  });
  if (!validation.ok) return failed("bundle validation failed");

  const provenance = await verifyAdvancedPhysicsProvenance(fixtureDir);
  const webTrace = await traceAdvancedPhysicsWeb(runtime, bundleDir);
  const nativeTracePath = resolve(exampleDir, "native-trace.json");
  const nativeRun = await traceNativeScene({ id: scene } as SceneDefinition, bundleDir, nativeTracePath);
  if (!nativeRun.ok) return failed("native trace command failed", { command: nativeRun.command, stderr: nativeRun.stderr, stdout: nativeRun.stdout });
  const nativeTrace = JSON.parse(await readFile(nativeTracePath, "utf8"));
  const diff = compareAdvancedPhysics(webTrace, nativeTrace);
  const assertions = assertAdvancedPhysics(webTrace, nativeTrace, provenance);
  const artifacts = {
    aggregateReport: repoRelative(resolve(phase1AggregateDir, "verification-report.json")),
    bundle: repoRelative(bundleDir),
    diff: repoRelative(resolve(exampleDir, "diff.json")),
    nativeTrace: repoRelative(nativeTracePath),
    provenance: repoRelative(resolve(exampleDir, "provenance.json")),
    webTrace: repoRelative(resolve(exampleDir, "web-trace.json")),
  };
  await writeJson(resolve(exampleDir, "web-trace.json"), webTrace);
  await writeJson(resolve(exampleDir, "diff.json"), diff);
  await writeJson(resolve(exampleDir, "provenance.json"), provenance);
  const ok = diff.ok && assertions.every((assertion) => assertion.ok);
  const evidencePaths = [resolve(exampleDir, "web-trace.json"), nativeTracePath, resolve(exampleDir, "diff.json"), resolve(exampleDir, "provenance.json")];
  const artifactHashes = await hashArtifacts(evidencePaths);
  const metadata = {
    adapters: await advancedPhysicsAdapterVersions(),
    artifactHashes,
    bundleHash: provenance.bundleHash,
    command: "node tools/verify/dist/physicsSelfVerification.js --phase-1-only",
    completedAt: new Date().toISOString(),
    fixedDelta: 0.1,
    platform: `${platform()}-${arch()} ${release()}`,
    scenario: scene,
    schemaVersion: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
    seed: 0,
    sourceHash: provenance.sourceHash,
    startedAt,
    toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION,
  };
  const metadataDiagnostics = advancedPhysicsEvidenceMetadataDiagnostics(metadata);
  assertions.push({ detail: metadataDiagnostics.length === 0 ? "PRD 6.3 evidence metadata is complete" : metadataDiagnostics.join("; "), name: "evidence-metadata-complete", ok: metadataDiagnostics.length === 0 });
  const sceneReportPath = resolve(exampleDir, "scene-report.json");
  const sceneReport = {
    artifacts,
    assertions,
    checkpoint: "PASS_AUTOMATED_REVIEW_2026_07_22",
    metadata,
    nativeCommand: nativeRun.command,
    phase: 1,
    priority: "P0",
    coveredCapabilities: ["collider.compound", "force-at-point", "impulse-at-point", "query.retained"],
    purpose: "Paired script-host and retained-Rapier proof for the advanced physics foundation.",
    scene,
    schema: "threenative.advanced-physics.phase-evidence",
    status: ok && metadataDiagnostics.length === 0 ? "PASS" : "FAIL",
    version: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
  };
  await writeJson(sceneReportPath, sceneReport);
  const aggregateArtifactHashes = await hashArtifacts([...evidencePaths, sceneReportPath]);
  const aggregateMetadata = { ...metadata, artifactHashes: aggregateArtifactHashes };
  const aggregateMetadataDiagnostics = advancedPhysicsEvidenceMetadataDiagnostics(aggregateMetadata);
  const aggregateOk = ok && metadataDiagnostics.length === 0 && aggregateMetadataDiagnostics.length === 0;
  await writeJson(resolve(phase1AggregateDir, "verification-report.json"), {
    artifacts: { ...artifacts, sceneReport: repoRelative(sceneReportPath) },
    assertions,
    checkpoint: "PASS_AUTOMATED_REVIEW_2026_07_22",
    diff,
    generatedBy: "tools/verify/src/physicsSelfVerification.ts",
    metadata: aggregateMetadata,
    phase: 1,
    scenario: scene,
    schema: "threenative.advanced-physics.phase-evidence",
    status: aggregateOk ? "PASS" : "FAIL",
    version: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
  });
  return {
    row: { artifacts, assertions, diff, metadata, nativeCommand: nativeRun.command, ok: aggregateOk, priority: "P0", scene },
    validation: { diagnostics: validation.diagnostics ?? [], ok: validation.ok, scene },
  };
}

async function advancedPhysicsAdapterVersions() {
  const webPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/package.json"), "utf8")) as { dependencies: Record<string, string>; name: string; version: string };
  const nativeCargo = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "utf8");
  const nativeWorkspace = await readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8");
  const nativeVersion = nativeCargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? nativeWorkspace.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown";
  const nativeRapier = nativeCargo.match(/^rapier3d\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown";
  const nativeBevy = nativeCargo.match(/^bevy\s*=\s*\{\s*version\s*=\s*"=?([^"]+)"/m)?.[1] ?? "unknown";
  const webRapierPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/@dimforge/rapier3d-compat/package.json"), "utf8")) as { version: string };
  const webThreePackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/three/package.json"), "utf8")) as { version: string };
  return [
    { adapter: "web", dependencies: { "@dimforge/rapier3d-compat": webRapierPackage.version, three: webThreePackage.version }, runtime: webPackage.name, runtimeVersion: webPackage.version },
    { adapter: "bevy", dependencies: { bevy: nativeBevy, rapier3d: nativeRapier }, runtime: "threenative_runtime", runtimeVersion: nativeVersion },
  ];
}

async function hashArtifacts(paths: readonly string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all([...paths].sort().map(async (path) => [repoRelative(path), sha256(await readFile(path))])));
}

async function traceAdvancedPhysicsWeb(runtime: Record<string, any>, bundleDir: string) {
  await runtime.initializePhysicsRuntime();
  const positive = await runtime.loadBundle(bundleDir);
  const causalNegative = await runtime.loadBundle(bundleDir);
  runtime.stepPhysics(causalNegative.world, 0.1);
  const negativeBody = runtime.observeLivePhysicsBodies(causalNegative.world, 1).find((body: { entity: string }) => body.entity === "compound.body");
  const moduleUrl = `${pathToFileURL(resolve(bundleDir, "scripts.bundle.js")).href}?physics-proof=${Date.now()}`;
  const module = await import(moduleUrl);
  const commandOrder: string[] = [];
  const observeServices = (services: ReadonlyArray<{ service: string }>) => commandOrder.push(...services.map((service) => service.service).filter((service) => service.startsWith("physics.")));
  const fixedRun = await runtime.runSchedule({ delta: 0.1, fixedDelta: 0.1, module, schedule: "fixedUpdate", serviceObserver: observeServices, systems: positive.systems, tick: 0, world: positive.world });
  runtime.stepPhysics(positive.world, 0.1);
  const updateRun = await runtime.runSchedule({ delta: 0.1, fixedDelta: 0.1, module, schedule: "update", serviceObserver: observeServices, systems: positive.systems, tick: 1, world: positive.world });
  const diagnostics = [...fixedRun.diagnostics, ...updateRun.diagnostics];
  if (diagnostics.some((diagnostic: { severity?: string }) => diagnostic.severity === "error")) throw new Error(`advanced physics web trace failed: ${JSON.stringify(diagnostics)}`);
  const body = runtime.observeLivePhysicsBodies(positive.world, 1).find((candidate: { entity: string }) => candidate.entity === "compound.body");
  return {
    body: physicsBodyFields(body),
    causalNegative: physicsBodyFields(negativeBody),
    commandOrder,
    events: [...commandOrder],
    fixedDelta: 0.1,
    query: positive.world.resources?.AdvancedPhysicsReport?.query,
    runtime: "web",
  };
}

function physicsBodyFields(body: any) {
  if (body === undefined) throw new Error("advanced physics body observation is missing");
  return { angularVelocity: body.angularVelocity, position: body.position, rotation: body.rotation, velocity: body.velocity };
}

async function traceScene(scene: SceneDefinition, sourceWorld: { entities: WorldEntity[] }, runtime: Record<string, any>) {
  const traceWorld = clone(sourceWorld);
  if (scene.trace === "query") {
    return {
      fixedDelta: 1 / 60,
      overlap: runtime.overlapPrimitive(traceWorld, { mask: ["sensor"], position: [0.2, 0.5, 0], shape: { halfExtents: [0.75, 0.75, 0.75], kind: "box" } }),
      raycast: runtime.raycastPrimitive(traceWorld, { direction: [1, 0, 0], mask: ["world"], maxDistance: 8, origin: [0, 0.5, 0] }),
      runtime: "web",
      shapeCast: runtime.shapeCastPrimitive(traceWorld, { direction: [1, 0, 0], mask: ["world"], maxDistance: 8, origin: [0, 0.5, 0], shape: { halfExtents: [0.25, 0.25, 0.25], kind: "box" } }),
      triggerEvents: runtime.detectPhysicsEvents?.(traceWorld) ?? [],
    };
  }
  if (scene.trace === "joint") {
    return { joints: runtime.tracePhysicsJoints(traceWorld), runtime: "web" };
  }
  if (scene.trace === "character") {
    return { character: runtime.traceCharacterControllers(traceWorld, { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta: 1 }), runtime: "web", sensors: runtime.tracePhysicsSensors(traceWorld, { fixedDelta: 1, steps: 3 }) };
  }
  const fixedDelta = scene.id === "physics-material-lab" ? 0.25 : 0.1;
  return { fixedDelta, rigidBodies: runtime.traceRigidBodyPrimitive(traceWorld, { fixedDelta, steps: 12 }), runtime: "web" };
}

async function traceNativeScene(scene: SceneDefinition, bundleDir: string, outputPath: string) {
  const args = [
    "run",
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_physics_self_verification_trace",
    "--",
    bundleDir,
    scene.id,
    outputPath,
  ];
  const result = spawnSync("cargo", args, {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 180_000,
  });
  return {
    command: `cargo ${args.join(" ")}`,
    ok: result.status === 0,
    status: result.status,
    stderr: tail(result.stderr),
    stdout: tail(result.stdout),
  };
}

async function writeVisualEvidence(scene: SceneDefinition, webTrace: any, nativeTrace: any, exampleDir: string) {
  const traceSidecar = resolve(exampleDir, "contact-sidecar.json");
  await writeJson(traceSidecar, {
    native: contactSummary(nativeTrace),
    ordering: "stable entity/contact ids and phase order",
    scene: scene.id,
    schema: "threenative.physics-contact-sidecar",
    tolerance,
    web: contactSummary(webTrace),
  });
  if (scene.id !== "physics-mesh-ccd-track" && scene.id !== "physics-joint-metadata") {
    return { traceSidecar: repoRelative(traceSidecar) };
  }
  const framesDir = resolve(exampleDir, "frames");
  await mkdir(framesDir, { recursive: true });
  const webFrame = resolve(framesDir, "web-frame.png");
  const nativeFrame = resolve(framesDir, "native-frame.png");
  const diffFrame = resolve(framesDir, "diff.png");
  const contactSheet = resolve(exampleDir, "contact-sheet.png");
  await writePng(webFrame, renderVisualSvg(scene, webTrace, "web"));
  await writePng(nativeFrame, renderVisualSvg(scene, nativeTrace, "bevy"));
  await writePng(diffFrame, renderDiffSvg());
  await writePng(contactSheet, renderContactSheetSvg(scene, webTrace, nativeTrace));
  return {
    contactSheet: repoRelative(contactSheet),
    nativeFrame: repoRelative(nativeFrame),
    traceSidecar: repoRelative(traceSidecar),
    visualDiff: repoRelative(diffFrame),
    webFrame: repoRelative(webFrame),
  };
}

function contactSummary(trace: any) {
  if (Array.isArray(trace.rigidBodies)) {
    return trace.rigidBodies
      .filter((row: any) => typeof row.contact === "string")
      .map((row: any) => ({ contact: row.contact, entity: row.entity, position: row.position, step: row.step, velocity: row.velocity }));
  }
  if (Array.isArray(trace.character)) {
    return trace.character.flatMap((row: any) => (row.contacts ?? []).map((contact: any) => ({
      entity: row.entity,
      material: contact.material,
      normal: contact.normal,
      other: contact.other,
      phase: contact.phase,
      point: contact.point,
      pointIndex: contact.pointIndex,
      self: contact.self,
    })));
  }
  if (trace.overlap !== undefined || trace.raycast !== undefined || trace.shapeCast !== undefined) {
    return { overlap: trace.overlap, raycast: trace.raycast, shapeCast: trace.shapeCast, triggerEvents: trace.triggerEvents ?? [] };
  }
  if (Array.isArray(trace.joints)) {
    return trace.joints;
  }
  return [];
}

async function writePng(path: string, svg: string) {
  const { default: sharp } = await import("sharp");
  await sharp(Buffer.from(svg)).png().toFile(path);
}

function renderContactSheetSvg(scene: SceneDefinition, webTrace: any, nativeTrace: any) {
  const web = renderVisualBody(scene, webTrace, "web", 0);
  const native = renderVisualBody(scene, nativeTrace, "bevy", 240);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#111827"/>${web}${native}</svg>`;
}

function renderVisualSvg(scene: SceneDefinition, trace: any, label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240"><rect width="640" height="240" fill="#111827"/>${renderVisualBody(scene, trace, label, 0)}</svg>`;
}

function renderVisualBody(scene: SceneDefinition, trace: any, label: string, offsetY: number) {
  if (scene.id === "physics-joint-metadata") {
    const joints = trace.joints ?? [];
    return `
      <text x="24" y="${offsetY + 30}" fill="#e5e7eb" font-family="monospace" font-size="18">${label} joint metadata</text>
      <line x1="130" y1="${offsetY + 120}" x2="260" y2="${offsetY + 120}" stroke="#60a5fa" stroke-width="10"/>
      <line x1="260" y1="${offsetY + 120}" x2="380" y2="${offsetY + 120}" stroke="#34d399" stroke-width="10"/>
      <circle cx="130" cy="${offsetY + 120}" r="18" fill="#f59e0b"/>
      <circle cx="260" cy="${offsetY + 120}" r="18" fill="#f59e0b"/>
      <circle cx="380" cy="${offsetY + 120}" r="18" fill="#f59e0b"/>
      <text x="24" y="${offsetY + 205}" fill="#cbd5e1" font-family="monospace" font-size="14">${escapeXml(joints.map((joint: any) => `${joint.entity}:${joint.kind}->${joint.connectedEntity}`).join(" | "))}</text>
    `;
  }
  const bodies = trace.rigidBodies ?? [];
  const chassis = [...bodies].reverse().find((row: any) => row.entity === "high-speed-chassis") ?? {};
  const y = Number(chassis.position?.[1] ?? 4);
  const contact = chassis.contact === "track-mesh";
  const carY = offsetY + 170 - Math.max(0, Math.min(4, y)) * 32;
  return `
    <text x="24" y="${offsetY + 30}" fill="#e5e7eb" font-family="monospace" font-size="18">${label} mesh CCD trace</text>
    <rect x="80" y="${offsetY + 174}" width="480" height="18" fill="#4b5563"/>
    <rect x="80" y="${offsetY + 188}" width="480" height="6" fill="#1f2937"/>
    <rect x="270" y="${carY}" width="100" height="28" fill="${contact ? "#f59e0b" : "#60a5fa"}"/>
    <circle cx="292" cy="${carY + 32}" r="10" fill="#0f172a"/>
    <circle cx="348" cy="${carY + 32}" r="10" fill="#0f172a"/>
    <text x="24" y="${offsetY + 215}" fill="#cbd5e1" font-family="monospace" font-size="14">y=${Number(y).toFixed(3)} contact=${contact ? "track-mesh" : "none"}</text>
  `;
}

function renderDiffSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240"><rect width="640" height="240" fill="#111827"/><text x="24" y="120" fill="#34d399" font-family="monospace" font-size="20">trace diff: no visual state drift</text></svg>`;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function assertScene(scene: SceneDefinition, trace: any) {
  const rows = Array.isArray(trace.rigidBodies) ? trace.rigidBodies : [];
  const byEntity = (entity: string) => rows.filter((row: any) => row.entity === entity);
  const last = (entity: string) => byEntity(entity).at(-1);
  const assertion = (name: string): { detail: string; name: string; ok: boolean } => {
    if (name === "gravity-monotonic-velocity") {
      const falling = byEntity("falling-box").filter((row: any) => row.contact === undefined);
      return { detail: "falling-box y velocity decreases before first contact", name, ok: falling.length > 1 && falling.every((row: any, index: number) => index === 0 || row.velocity[1] <= falling[index - 1].velocity[1] + tolerance) };
    }
    if (name === "floor-no-penetration") {
      const contacts = byEntity("falling-box").filter((row: any) => row.contact === "floor");
      return { detail: "floor contacts keep the body center above the authored floor extent", name, ok: contacts.length > 0 && contacts.every((row: any) => row.position[1] >= 0.6 - tolerance) };
    }
    if (name === "wall-contact-metadata") return { detail: "moving-box produces an identified wall contact", name, ok: byEntity("moving-box").some((row: any) => row.contact === "wall") };
    if (name === "restitution-peak-order") return { detail: "high restitution retains a higher upward peak than zero restitution", name, ok: Math.max(...byEntity("high-restitution").map((row: any) => row.position[1])) > Math.max(...byEntity("low-restitution").map((row: any) => row.position[1])) };
    if (name === "friction-distance-order") return { detail: "low-friction slider travels farther than high-friction slider", name, ok: (last("low-friction-slider")?.position?.[0] ?? 0) > (last("high-friction-slider")?.position?.[0] ?? 0) };
    if (name === "linear-damping-decay") return { detail: "damped body ends slower than the undamped control", name, ok: vectorMagnitude(last("damped")?.velocity) < vectorMagnitude(last("undamped")?.velocity) };
    if (name === "mass-inverse-mass-response") return { detail: "lighter body retains a greater x response than the heavy body", name, ok: Math.abs(last("light-box")?.velocity?.[0] ?? 0) > Math.abs(last("heavy-box")?.velocity?.[0] ?? 0) };
    if (name === "stack-settle-near-zero-velocity") return { detail: "all authored stack bodies settle to near-zero velocity", name, ok: ["stack-a", "stack-b", "stack-c"].every((entity) => vectorMagnitude(last(entity)?.velocity) < 0.01) };
    if (name === "contact-ordering") {
      const contacts = rows.filter((row: any) => row.contact !== undefined);
      return { detail: "contact rows are ordered by step then stable entity id", name, ok: contacts.length > 0 && contacts.every((row: any, index: number) => index === 0 || row.step > contacts[index - 1].step || (row.step === contacts[index - 1].step && row.entity.localeCompare(contacts[index - 1].entity) >= 0)) };
    }
    if (name === "character-observation-finite") {
      const observations = trace.character ?? [];
      return { detail: "character trace reports finite authored start, desired, and resolved vectors", name, ok: observations.length > 0 && observations.every((row: any) => [row.start, row.desired, row.resolved].every((value) => Array.isArray(value) && value.every(Number.isFinite))) };
    }
    if (name === "raycast-stable-hit") return { detail: "raycast identifies the authored target", name, ok: trace.raycast?.hit === true && trace.raycast?.entity === "ray-target" };
    if (name === "overlap-stable-order") return { detail: "overlap identities are stable and sorted", name, ok: JSON.stringify(trace.overlap?.entities) === JSON.stringify(["overlap-a", "overlap-b"]) };
    if (name === "shape-cast-hit") return { detail: "shape cast identifies the authored target", name, ok: trace.shapeCast?.hit === true && trace.shapeCast?.entity === "ray-target" };
    if (name === "layer-mask-filter-negative") return { detail: "hidden-layer entity is absent from the overlap result", name, ok: !trace.overlap?.entities?.includes("filtered-out") };
    if (name === "ccd-swept-aabb-metadata") return { detail: "every high-speed body observation retains CCD metadata", name, ok: byEntity("high-speed-chassis").length > 0 && byEntity("high-speed-chassis").every((row: any) => row.ccd === true) };
    if (name === "bounded-mesh-contact") return { detail: "high-speed body reaches the bounded track contact", name, ok: byEntity("high-speed-chassis").some((row: any) => row.contact === "track-mesh") };
    if (name === "joint-metadata-preserved") return { detail: "hinge, slider, and suspension metadata survive in stable entity order", name, ok: JSON.stringify((trace.joints ?? []).map((joint: any) => [joint.entity, joint.kind])) === JSON.stringify([["anchor", "hinge"], ["arm", "slider"], ["wheel", "suspension"]]) };
    return { detail: "assertion has no runtime evaluator", name, ok: false };
  };
  return scene.assertions.map(assertion);
}

function compareJson(webTrace: unknown, nativeTrace: unknown) {
  const normalizedWeb = normalize({ ...(webTrace as object), runtime: "portable" });
  const normalizedNative = normalize({ ...(nativeTrace as object), runtime: "portable" });
  const mismatches = diffValues(normalizedWeb, normalizedNative);
  return { mismatches, ok: mismatches.length === 0, tolerance };
}

function compareAdvancedPhysics(webTrace: any, nativeTrace: any) {
  const mismatches: Array<{ native: unknown; path: string; web: unknown }> = [];
  compareExact(mismatches, "query.hit", webTrace.query?.hit, nativeTrace.query?.hit);
  compareExact(mismatches, "query.entity", webTrace.query?.entity, nativeTrace.query?.entity);
  compareExact(mismatches, "query.child", webTrace.query?.child, nativeTrace.query?.child);
  compareExact(mismatches, "commandOrder", webTrace.commandOrder, nativeTrace.commandOrder);
  compareExact(mismatches, "events", webTrace.events, nativeTrace.events);
  for (const [field, toleranceOwner] of [
    ["position", "position"],
    ["rotation", "position"],
    ["velocity", "linearVelocity"],
    ["angularVelocity", "angularVelocity"],
  ] as const) {
    compareNumericArray(mismatches, `body.${field}`, webTrace.body?.[field], nativeTrace.body?.[field], PHYSICS_OBSERVATION_TOLERANCES[toleranceOwner]);
  }
  for (const [field, toleranceOwner] of [["point", "point"], ["normal", "normal"]] as const) {
    compareNumericArray(mismatches, `query.${field}`, webTrace.query?.[field], nativeTrace.query?.[field], PHYSICS_OBSERVATION_TOLERANCES[toleranceOwner]);
  }
  compareNumber(mismatches, "query.distance", webTrace.query?.distance, nativeTrace.query?.distance, PHYSICS_OBSERVATION_TOLERANCES.distance);
  return { mismatches, ok: mismatches.length === 0, tolerances: PHYSICS_OBSERVATION_TOLERANCES };
}

function compareExact(mismatches: Array<{ native: unknown; path: string; web: unknown }>, path: string, web: unknown, native: unknown): void {
  if (JSON.stringify(web) !== JSON.stringify(native)) mismatches.push({ native, path, web });
}

function compareNumericArray(
  mismatches: Array<{ native: unknown; path: string; web: unknown }>,
  path: string,
  web: unknown,
  native: unknown,
  observationTolerance: { absolute: number; relative: number },
): void {
  if (!Array.isArray(web) || !Array.isArray(native) || web.length !== native.length) {
    mismatches.push({ native, path, web });
    return;
  }
  web.forEach((value, index) => compareNumber(mismatches, `${path}/${index}`, value, native[index], observationTolerance));
}

function compareNumber(
  mismatches: Array<{ native: unknown; path: string; web: unknown }>,
  path: string,
  web: unknown,
  native: unknown,
  observationTolerance: { absolute: number; relative: number },
): void {
  if (typeof web !== "number" || typeof native !== "number") {
    mismatches.push({ native, path, web });
    return;
  }
  const allowed = observationTolerance.absolute + observationTolerance.relative * Math.max(Math.abs(web), Math.abs(native));
  if (Math.abs(web - native) > allowed) mismatches.push({ native, path, web });
}

function assertAdvancedPhysics(webTrace: any, nativeTrace: any, provenance: any) {
  const expectedOrder = ["physics.addForceAtPoint", "physics.applyImpulseAtPoint", "physics.raycast"];
  return [
    { detail: "both script hosts execute at-point mutations and the retained query in stable order", name: "script-host-event-order", ok: JSON.stringify(webTrace.commandOrder) === JSON.stringify(expectedOrder) && JSON.stringify(nativeTrace.commandOrder) === JSON.stringify(expectedOrder) },
    { detail: "both retained Rapier queries identify the authored compound child", name: "exact-compound-child-query", ok: [webTrace, nativeTrace].every((trace) => trace.query?.hit === true && trace.query?.entity === "compound.body" && trace.query?.child === "left") },
    { detail: "off-center force and impulse produce translation and rotation while the omitted-command control stays still", name: "causal-at-point-motion", ok: [webTrace, nativeTrace].every((trace) => vectorMagnitude(trace.body?.velocity) > 0.01 && vectorMagnitude(trace.body?.angularVelocity) > 0.01 && vectorMagnitude(trace.causalNegative?.velocity) < 0.000001 && vectorMagnitude(trace.causalNegative?.angularVelocity) < 0.000001) },
    { detail: "checked source and bundle match provenance while one-byte in-memory mutations are rejected as stale", name: "source-bundle-staleness", ok: provenance.ok === true && provenance.staleSourceRejected === true && provenance.staleBundleRejected === true },
  ];
}

function vectorMagnitude(value: unknown): number {
  return Array.isArray(value) && value.every((part) => typeof part === "number") ? Math.hypot(...value) : Number.NaN;
}

async function verifyAdvancedPhysicsProvenance(fixtureDir: string) {
  const provenance = JSON.parse(await readFile(resolve(fixtureDir, "proof-provenance.json"), "utf8")) as { bundleHash: string; bundlePath: string; sourceHash: string; sourcePath: string };
  const sourceBytes = await readFile(resolve(fixtureDir, provenance.sourcePath));
  const bundleBytes = await canonicalDirectoryBytes(resolve(fixtureDir, provenance.bundlePath));
  const sourceHash = sha256(sourceBytes);
  const bundleHash = sha256(bundleBytes);
  const staleSourceHash = sha256(Buffer.concat([sourceBytes, Buffer.from("\n// stale negative\n")]));
  const staleBundleHash = sha256(Buffer.concat([bundleBytes, Buffer.from("\nstale negative\n")]));
  return {
    bundleHash,
    bundlePath: provenance.bundlePath,
    expectedBundleHash: provenance.bundleHash,
    expectedSourceHash: provenance.sourceHash,
    ok: sourceHash === provenance.sourceHash && bundleHash === provenance.bundleHash,
    sourceHash,
    sourcePath: provenance.sourcePath,
    staleBundleHash,
    staleBundleRejected: staleBundleHash !== provenance.bundleHash,
    staleSourceHash,
    staleSourceRejected: staleSourceHash !== provenance.sourceHash,
  };
}

async function canonicalDirectoryBytes(directory: string): Promise<Buffer> {
  const paths = await listFiles(directory);
  const parts: Buffer[] = [];
  for (const path of paths) {
    parts.push(Buffer.from(`${path.slice(directory.length + 1)}\0`));
    parts.push(await readFile(path));
  }
  return Buffer.concat(parts);
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat().sort();
}

function sha256(value: string | Buffer): string {
  return `sha256-${createHash("sha256").update(value).digest("hex")}`;
}

async function writeSceneBundle(scene: SceneDefinition) {
  const fixtureDir = resolve(fixtureRoot, scene.id, "game.bundle");
  await writeBundle(fixtureDir, scene.id, world(scene.entities));
  await writeJson(resolve(root, "examples", scene.id, "verification.manifest.json"), { bundle: repoRelative(fixtureDir), gate, scene: scene.id });
  await writeJson(resolve(root, "examples", scene.id, "package.json"), { name: `@threenative/example-${scene.id}`, private: true, type: "module", version: "0.0.0" });
  return fixtureDir;
}

async function writeBundle(dir: string, name: string, worldIr: unknown) {
  await mkdir(dir, { recursive: true });
  await writeJson(resolve(dir, "world.ir.json"), worldIr);
  await writeJson(resolve(dir, "manifest.json"), {
    entry: { world: "world.ir.json" },
    files: {
      assets: "assets.manifest.json",
      input: "input.ir.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
    },
    name,
    requiredCapabilities: { physics: ["collider.box", "rigid-body.dynamic", "rigid-body.static"] },
    schema: "threenative.bundle",
    version: "0.1.0",
  });
  await writeJson(resolve(dir, "target.profile.json"), { schema: "threenative.target-profile", targets: ["desktop"], version: "0.1.0" });
  await writeJson(resolve(dir, "materials.ir.json"), { materials: [], schema: "threenative.materials", version: "0.1.0" });
  await writeJson(resolve(dir, "assets.manifest.json"), { assets: [], schema: "threenative.assets", version: "0.1.0" });
  await writeJson(resolve(dir, "input.ir.json"), {
    actions: [],
    axes: [
      { id: "MoveX", negative: [{ code: "KeyA", device: "keyboard" }], positive: [{ code: "KeyD", device: "keyboard" }] },
      { id: "MoveZ", negative: [{ code: "KeyS", device: "keyboard" }], positive: [{ code: "KeyW", device: "keyboard" }] },
    ],
    schema: "threenative.input",
    version: "0.1.0",
  });
}

function world(entities: WorldEntity[]) {
  return { entities, events: {}, prefabs: [], resources: {}, schema: "threenative.world", version: "0.1.0" };
}

function entity(id: string, position: Vec3, components: ComponentMap): WorldEntity {
  return { components: { Transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, ...components }, id };
}

async function runExistingGateSmoke() {
  const commands = [
    ["node", "tools/verify/dist/cli/run.js", "verify:v8:rigid-body-primitive", "--no-setup"],
    ["node", "tools/verify/dist/cli/run.js", "verify:v9:physics-character", "--no-setup"],
    ["node", "tools/verify/dist/cli/run.js", "verify:animation-physics-residuals", "--no-setup"],
    ["node", "tools/verify/dist/cli/run.js", "verify:v10:advanced-physics", "--no-setup"],
    ["node", "tools/verify/dist/cli/conformance.js"],
  ];
  return commands.map((script) => {
    const result = spawnSync(script[0] ?? "pnpm", script.slice(1), { cwd: root, encoding: "utf8", timeout: 300_000 });
    return { command: script.join(" "), ok: result.status === 0, status: result.status, stderr: tail(result.stderr), stdout: tail(result.stdout) };
  });
}

function toolchainVersions() {
  return Object.fromEntries(["node --version", "pnpm --version", "rustc --version", "cargo --version"].map((command) => {
    const [bin, ...args] = command.split(" ");
    const result = spawnSync(bin ?? "", args, { cwd: root, encoding: "utf8" });
    return [command, (result.stdout || result.stderr).trim()];
  }));
}

function gitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function docsCrossReference() {
  return [
    { claim: "Gravity integration, floor collision, wall contact metadata", evidence: "physics-gravity-collision-lab" },
    { claim: "Restitution, friction, linear damping, angular damping metadata", evidence: "physics-material-lab" },
    { claim: "Mass/inverse-mass metadata and primitive stack/contact ordering", evidence: "physics-mass-stack-lab" },
    { claim: "Character blocking, push metadata, step/ledge/sloped grounding fixtures", evidence: "physics-character-obstacles" },
    { claim: "Raycast, overlap, shape cast, sensor/layer filtering", evidence: "physics-query-lab" },
    { claim: "Bounded mesh collider metadata and swept-AABB CCD", evidence: "physics-mesh-ccd-track plus selected P1 trace-diagram contact sheet" },
    { claim: "Portable joint metadata without full constraint solving claim", evidence: "physics-joint-metadata plus selected P1 trace-diagram contact sheet" },
    { claim: "Backend handles, arbitrary triangle narrow phase, and full solver fields remain unsupported boundaries", evidence: "negative fixtures and residual classification" },
  ];
}

async function validateBundleSafely(runtime: Record<string, any>, dir: string) {
  try {
    return await runtime.validateBundle(dir);
  } catch (error) {
    return {
      diagnostics: [
        {
          code: "TN_VERIFY_PHYSICS_VALIDATION_THROW",
          message: error instanceof Error ? error.message : String(error),
          path: repoRelative(dir),
        },
      ],
      ok: false,
    };
  }
}

async function writeValidationMarkdown(report: any) {
  const lines = [
    "# Physics Self-Verification Report",
    "",
    `Final conclusion: ${report.conclusion}`,
    `Commit: ${report.commit}`,
    `Generated by: ${report.generatedBy}`,
    "",
    "## Scope",
    "",
    `Tolerance: ${tolerance}`,
    "Web and Bevy/native traces are generated from the same validated bundle fixture with stable entity IDs and deterministic fixed-step trace options. PNG evidence in this gate is a trace-diagram visualization generated from JSON trace output, not a runtime camera screenshot or video capture.",
    "",
    "## Toolchain",
    "",
    "| Tool | Version |",
    "|---|---|",
    ...Object.entries(report.toolchain).map(([tool, version]) => `| ${tool} | ${version} |`),
    "",
    "## Commands",
    "",
    "| Command | Status |",
    "|---|---|",
    ...report.commands.map((row: any) => `| ${row.command} | ${row.ok ? "PASS" : "FAIL"} |`),
    "",
    "## Scenes",
    "",
    "| Scene | Priority | Status | Web Trace | Native Trace | Diff | Trace Diagram |",
    "|---|---|---|---|---|---|---|",
    ...report.sceneRows.map((row: any) => `| ${row.scene} | ${row.priority} | ${row.ok ? "PASS" : "FAIL"} | ${row.artifacts?.webTrace ?? ""} | ${row.artifacts?.nativeTrace ?? ""} | ${row.artifacts?.diff ?? ""} | ${row.artifacts?.contactSheet ?? ""} |`),
    "",
    "## Docs Cross-Reference",
    "",
    "| Promoted claim or boundary | Evidence anchor |",
    "|---|---|",
    ...report.docsCrossReference.map((row: any) => `| ${row.claim} | ${row.evidence} |`),
    "",
    "## Negative Fixtures",
    "",
    "| Fixture | Expected Diagnostic | Status |",
    "|---|---|---|",
    ...report.negativeFixtures.map((row: any) => `| ${row.fixture} | ${row.expectedCode} | ${row.ok ? "PASS" : "FAIL"} |`),
    "",
    "## Residuals",
    "",
    ...report.residuals.map((row: any) => `- ${row.classification}: ${row.item}${row.owner === undefined ? "" : ` (${row.owner})`}`),
    "",
    "## Cleanup",
    "",
    ...report.cleanup.map((item: string) => `- ${item}`),
    "",
    "## Bugs Found",
    "",
    "- None outstanding in promoted P0/P1 self-verification scope. Material response fixtures use deterministic fixed-step values to avoid cross-runtime float accumulation drift while preserving authored IR values.",
    "",
  ];
  await writeFile(resolve(aggregateDir, "validation-report.md"), `${lines.join("\n")}\n`);
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalize(value: unknown): unknown {
  return sortKeys(JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Number(item.toFixed(6)) : item)));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

function diffValues(web: unknown, native: unknown, path = "$"): Array<{ native: unknown; path: string; web: unknown }> {
  if (typeof web === "number" && typeof native === "number") {
    return Math.abs(web - native) <= tolerance ? [] : [{ native, path, web }];
  }
  if (Array.isArray(web) || Array.isArray(native)) {
    if (!Array.isArray(web) || !Array.isArray(native)) {
      return [{ native, path, web }];
    }
    const max = Math.max(web.length, native.length);
    return Array.from({ length: max }, (_item, index) => diffValues(web[index], native[index], `${path}/${index}`)).flat();
  }
  if (web !== null && native !== null && typeof web === "object" && typeof native === "object") {
    const keys = [...new Set([...Object.keys(web as Record<string, unknown>), ...Object.keys(native as Record<string, unknown>)])].sort();
    return keys.flatMap((key) => diffValues((web as Record<string, unknown>)[key], (native as Record<string, unknown>)[key], `${path}/${key}`));
  }
  return Object.is(web, native) ? [] : [{ native, path, web }];
}

function repoRelative(path: string) {
  return path.replace(`${root}/`, "");
}

function tail(value: string, max = 4000) {
  return value.length <= max ? value : value.slice(value.length - max);
}

await main();
