import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { addEntity, attachScript, bindUi, setCamera, setTransform, validateScene } from "../index.js";

test("validateScene accepts a valid structured scene document", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-valid-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.arena",
      prefabs: [{ id: "kart" }],
      resources: [{ id: "hud.score" }],
      entities: [
        {
          id: "player-kart",
          prefab: "kart",
          transform: { position: [0, 1, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
          components: {},
        },
        {
          id: "chase-camera",
          components: { camera: { mode: "third-person-follow", target: "player-kart" } },
        },
      ],
      systems: [{ id: "race-controller", script: { module: "src/scripts/race.ts", export: "raceController" } }],
      ui: {
        nodes: [{ id: "score-label" }],
        bindings: [{ node: "score-label", resource: "hud.score.value" }],
      },
    });
    await writeFile(join(root, "src", "scripts", "race.ts"), "export function raceController() {}\n");

    const result = await validateScene({ projectPath: root, sceneId: "scene.arena" });

    assert.equal(result.ok, true);
    assert.equal(result.changed, false);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validateScene accepts runtime-derived hierarchical entity ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-hierarchical-id-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.destruction",
      entities: [
        { id: "wall" },
        { id: "wall/piece.northwest", components: { Hierarchy: { parent: "wall" } } },
      ],
    });

    const result = await validateScene({ projectPath: root, sceneId: "scene.destruction" });

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validateScene validates lifecycle source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-lifecycle-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.menu",
      kind: "menu",
      activation: "exclusive",
      initial: true,
      entities: [],
    });

    const valid = await validateScene({ projectPath: root, sceneId: "scene.menu" });
    assert.equal(valid.ok, true);

    await writeScene(root, {
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.menu",
      kind: "splash",
      activation: "modal",
      initial: "yes",
      entities: [],
    });

    const invalid = await validateScene({ projectPath: root, sceneId: "scene.menu" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.diagnostics.some((diagnostic) => diagnostic.path === "/kind" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(invalid.diagnostics.some((diagnostic) => diagnostic.path === "/activation" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(invalid.diagnostics.some((diagnostic) => diagnostic.path === "/initial" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validateScene reports deterministic repair diagnostics for invalid scenes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-invalid-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      id: "Scene Arena",
      positon: [0, 0, 0],
      prefabs: [{ id: "kart" }, { id: "kart" }],
      resources: [{ id: "hud.score", path: "dist/game.bundle/resources.json" }],
      entities: [
        {
          id: "player-kart",
          prefab: "kartt",
          transform: { position: [0, 1], scale: [1, Number.NaN, 1] },
          components: { camera: { mode: "third-person-follow", target: "player-kartt" }, unknown: {} },
        },
        { id: "player-kart" },
      ],
      systems: [
        { id: "race-controller", script: { module: "src/scripts/race.ts", export: "raceController" } },
        { id: "bad-inline", run: "console.log('bad')" },
        { id: "bundle-ref", script: { module: "dist/game.bundle/scripts.bundle.js", export: "bundleRef" } },
      ],
      ui: {
        nodes: [{ id: "score-label" }, { id: "score-label" }],
        bindings: [{ node: "score-labl", resource: "hud.missing.value" }],
      },
    });
    await writeFile(join(root, "src", "scripts", "race.ts"), "export function otherSystem() {}\n");

    const result = await validateScene({ projectPath: root });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    assert.equal(result.ok, false);
    assert.deepEqual(codes, [
      "TN_AUTHORING_REF_MISSING",
      "TN_AUTHORING_REF_MISSING",
      "TN_AUTHORING_VECTOR3_INVALID",
      "TN_AUTHORING_VECTOR3_INVALID",
      "TN_AUTHORING_DUPLICATE_ENTITY_ID",
      "TN_AUTHORING_ID_INVALID",
      "TN_AUTHORING_UNKNOWN_FIELD",
      "TN_AUTHORING_DUPLICATE_PREFAB_ID",
      "TN_AUTHORING_GENERATED_SOURCE_PATH",
      "TN_AUTHORING_SCRIPT_EXPORT_MISSING",
      "TN_AUTHORING_INLINE_SCRIPT_FORBIDDEN",
      "TN_AUTHORING_UNKNOWN_FIELD",
      "TN_AUTHORING_GENERATED_SOURCE_PATH",
      "TN_AUTHORING_REF_MISSING",
      "TN_AUTHORING_REF_MISSING",
      "TN_AUTHORING_DUPLICATE_UI_NODE_ID",
    ]);
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.path === "/entities/0/components/camera/target")?.suggestion, "Did you mean 'player-kart'?");
    assert.equal(result.diagnostics.find((diagnostic) => diagnostic.path === "/ui/bindings/0/node")?.suggestion, "Did you mean 'score-label'?");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validateScene reports a missing requested scene with closest-id suggestion", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-missing-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      id: "scene.arena",
      entities: [],
    });

    const result = await validateScene({ projectPath: root, sceneId: "scene.areena" });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_AUTHORING_SCENE_MISSING");
    assert.equal(result.diagnostics[0]?.suggestion, "Did you mean 'scene.arena'?");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validateScene reports typed component diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-component-invalid-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      id: "scene.components",
      entities: [
        {
          id: "player",
          components: {
            Light: { color: "", intensity: "bright", kind: "sun" },
            RenderLayers: { layers: ["gameplay", ""] },
            RigidBody: { kind: "moving", mass: "heavy" },
            Collider: { kind: "pyramid", size: [1, 2] },
            CharacterController: { blocking: "yes", grounding: "floor", moveXAxis: "", speed: Number.NaN },
            Visibility: { visible: "no" },
          },
        },
      ],
    });

    const result = await validateScene({ projectPath: root, sceneId: "scene.components" });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/Light/kind" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/Light/intensity" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/RenderLayers/layers" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/RigidBody/kind" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/RigidBody/kind" && diagnostic.fix?.snippet === "{ \"RigidBody\": { \"kind\": \"static\" } }"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/Collider/size" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/CharacterController/grounding" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/Visibility/visible" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validateScene accepts kinematic movers and formatted UI bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-abstractions-valid-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      id: "scene.abstractions",
      resources: [{ id: "GameState" }],
      entities: [
        {
          id: "sweeper",
          components: {
            KinematicMover: { mode: "sine", axis: "x", radius: 2.1, phase: 0.1, speed: 1.25 },
          },
        },
      ],
      ui: {
        nodes: [{ id: "hud-progress" }],
        bindings: [
          {
            node: "hud-progress",
            resource: "GameState",
            fields: ["checkpoint", "checkpointTotal", "hits", "elapsed"],
            format: "CP {checkpoint}/{checkpointTotal}  Hits {hits}  {elapsed:fixed1}",
          },
        ],
      },
    });

    const result = await validateScene({ projectPath: root, sceneId: "scene.abstractions" });

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validateScene rejects invalid kinematic movers and formatted UI bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-abstractions-invalid-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      id: "scene.abstractions",
      resources: [{ id: "GameState" }],
      entities: [
        {
          id: "sweeper",
          components: {
            KinematicMover: { mode: "orbit", axis: "q", radius: -1, speed: "fast", waypoints: [[0, 0]] },
          },
        },
      ],
      ui: {
        nodes: [{ id: "hud-progress" }],
        bindings: [{ node: "hud-progress", resource: "GameState", fields: ["checkpoint"], format: "CP {checkpoint}/{total} {elapsed:precision2}" }],
      },
    });

    const result = await validateScene({ projectPath: root, sceneId: "scene.abstractions" });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/KinematicMover/mode" && diagnostic.code === "TN_AUTHORING_COMPONENT_VALUE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/KinematicMover/axis" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/KinematicMover/radius" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/KinematicMover/speed" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === "/entities/0/components/KinematicMover/waypoints" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID"), true);
    assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.path === "/ui/bindings/0/format" && diagnostic.code === "TN_AUTHORING_SHAPE_INVALID").length, 2);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene mutations validate before writing deterministic source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-mutate-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      id: "scene.arena",
      prefabs: [{ id: "kart" }],
      resources: [{ id: "hud.score" }],
      entities: [{ id: "player-kart" }, { id: "chase-camera" }],
      systems: [],
      ui: { nodes: [{ id: "score-label" }] },
    });
    await writeFile(join(root, "src", "scripts", "race.ts"), "export function raceController() {}\n");

    assert.equal((await addEntity({ projectPath: root, sceneId: "scene.arena", entityId: "rival-kart", prefabId: "kart" })).ok, true);
    assert.equal((await setTransform({ projectPath: root, sceneId: "scene.arena", entityId: "rival-kart", position: [1, 2, 3] })).ok, true);
    assert.equal((await setCamera({ projectPath: root, sceneId: "scene.arena", cameraId: "chase-camera", mode: "third-person-follow", targetId: "player-kart" })).ok, true);
    assert.equal((await attachScript({ projectPath: root, sceneId: "scene.arena", systemId: "race-controller", modulePath: "src/scripts/race.ts", exportName: "raceController" })).ok, true);
    assert.equal((await bindUi({ projectPath: root, sceneId: "scene.arena", uiNodeId: "score-label", resourcePath: "hud.score.value" })).ok, true);

    const validation = await validateScene({ projectPath: root, sceneId: "scene.arena" });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("setTransform preserves component-style scenes without duplicate transform schemas", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-component-transform-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      version: "0.1.0",
      id: "scene.component-transform",
      entities: [
        {
          id: "player",
          components: {
            Transform: { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
          },
        },
        { id: "checkpoint", components: {} },
      ],
    });

    const result = await setTransform({
      projectPath: root,
      sceneId: "scene.component-transform",
      entityId: "checkpoint",
      position: [4, 2, 1],
    });

    assert.equal(result.ok, true);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: unknown; components?: { Transform?: unknown } }>;
    };
    const checkpoint = scene.entities.find((entity) => entity.id === "checkpoint");
    assert.equal(checkpoint?.transform, undefined);
    assert.deepEqual(checkpoint?.components?.Transform, { position: [4, 2, 1] });
    assert.equal((await validateScene({ projectPath: root, sceneId: "scene.component-transform" })).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("scene mutations fail without partially writing invalid edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-mutate-invalid-"));
  try {
    await writeScene(root, {
      schema: "threenative.scene",
      id: "scene.arena",
      entities: [{ id: "player-kart" }],
    });

    const result = await setCamera({
      projectPath: root,
      sceneId: "scene.arena",
      cameraId: "player-kart",
      mode: "third-person-follow",
      targetId: "missing-kart",
    });

    assert.equal(result.ok, false);
    assert.equal(result.changed, false);
    assert.deepEqual(result.filesWritten, []);
    assert.equal(result.diagnostics[0]?.code, "TN_AUTHORING_REF_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeScene(root: string, scene: unknown): Promise<void> {
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await mkdir(join(root, "src", "scripts"), { recursive: true });
  await writeFile(join(root, "content", "scenes", "arena.scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
}
