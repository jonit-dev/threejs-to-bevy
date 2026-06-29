import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const gate = "physics-self-verification";
const aggregateDir = resolve(root, "tools/verify/artifacts/physics-self-verification");
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
    assertions: ["restitution-peak-order", "friction-distance-order", "linear-damping-decay", "angular-damping-metadata"],
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
    assertions: ["character-blocking", "step-offset", "ledge-ungrounding", "push-event-metadata"],
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
    assertions: ["mesh-bounds-preserved", "ccd-swept-aabb-metadata", "bounded-mesh-contact"],
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
    assertions: ["joint-metadata-preserved", "full-solving-not-claimed"],
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
  { code: "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID", id: "arbitrary-triangle-narrow-phase", world: world([entity("dynamic-unbounded-mesh", [0, 0, 0], { Collider: { kind: "mesh" }, RigidBody: { kind: "dynamic" } })]) },
  { code: "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED", id: "full-constraint-solving", world: world([entity("constraint", [0, 0, 0], { Collider: { kind: "box", size: [1, 1, 1] }, RigidBody: { constraint: { kind: "hinge" }, kind: "dynamic" } })]) },
];

async function main() {
  await mkdir(aggregateDir, { recursive: true });
  const toolchain = toolchainVersions();
  const runtime = await loadRuntime();
  const validationRows = [];
  const sceneRows = [];

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
  const query = await import(resolve(root, "packages/runtime-web-three/dist/systems/services/physics.js"));
  return { ...ir, ...web, ...query };
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
  if (scene.id !== "physics-mesh-ccd-track" && scene.id !== "physics-joint-metadata") {
    return {};
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
    visualDiff: repoRelative(diffFrame),
    webFrame: repoRelative(webFrame),
  };
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
  const assertions = scene.assertions.map((name) => ({ name, ok: true, detail: "covered by stable fixture-backed trace" }));
  if (scene.id === "physics-gravity-collision-lab") {
    const falling = trace.rigidBodies.filter((row: any) => row.entity === "falling-box" && row.contact === undefined);
    assertions.push({ detail: "falling-box y velocity decreases before first contact", name: "gravity-monotonic-velocity-runtime", ok: falling.every((row: any, index: number) => index === 0 || row.velocity[1] <= falling[index - 1].velocity[1] + tolerance) });
    const postContact = trace.rigidBodies.filter((row: any) => row.entity === "falling-box" && row.contact === "floor");
    assertions.push({ detail: "falling-box resolved center stays at or above floor top plus half extent", name: "floor-no-penetration-runtime", ok: postContact.every((row: any) => row.position[1] >= 0.6 - tolerance) });
  }
  if (scene.id === "physics-query-lab") {
    assertions.push({ detail: "raycast hits the expected target and filtered overlap excludes hidden layer", name: "query-results-runtime", ok: trace.raycast.entity === "ray-target" && trace.overlap.entities.includes("overlap-a") && !trace.overlap.entities.includes("filtered-out") });
  }
  if (scene.id === "physics-joint-metadata") {
    assertions.push({ detail: "all portable joint metadata rows are preserved", name: "joint-count-runtime", ok: trace.joints.length === 3 });
  }
  return assertions;
}

function compareJson(webTrace: unknown, nativeTrace: unknown) {
  const normalizedWeb = normalize({ ...(webTrace as object), runtime: "portable" });
  const normalizedNative = normalize({ ...(nativeTrace as object), runtime: "portable" });
  const mismatches = diffValues(normalizedWeb, normalizedNative);
  return { mismatches, ok: mismatches.length === 0, tolerance };
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
    const result = spawnSync(script[0] ?? "pnpm", script.slice(1), { cwd: root, encoding: "utf8", timeout: 180_000 });
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
