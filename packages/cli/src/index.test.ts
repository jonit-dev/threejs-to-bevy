import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CLI_COMMAND_DEFINITIONS, CLI_COMMAND_REGISTRY, UNMIGRATED_COMMAND_FAMILIES, dispatch, renderHelp } from "./index.js";
import { findCommand } from "./commands/registry.js";

test("should print help when requested", async () => {
  const result = await dispatch(["--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Commands:/);
  assert.match(result.stdout, /asset/);
  assert.match(result.stdout, /animation/);
  assert.match(result.stdout, /create/);
  assert.match(result.stdout, /init/);
  assert.match(result.stdout, /help/);
  assert.match(result.stdout, /doctor/);
  assert.match(result.stdout, /validate/);
  assert.match(result.stdout, /build/);
  assert.match(result.stdout, /input/);
  assert.match(result.stdout, /material/);
  assert.match(result.stdout, /mesh/);
  assert.match(result.stdout, /prefab/);
  assert.match(result.stdout, /compare-images/);
  assert.match(result.stdout, /dev/);
  assert.match(result.stdout, /editor/);
  assert.match(result.stdout, /package/);
  assert.match(result.stdout, /particle/);
  assert.match(result.stdout, /physics/);
  assert.match(result.stdout, /nav/);
  assert.match(result.stdout, /scene/);
  assert.match(result.stdout, /system/);
  assert.match(result.stdout, /ui/);
  assert.match(result.stdout, /model-test/);
  assert.match(result.stdout, /screenshot/);
  assert.match(result.stdout, /record/);
  assert.match(result.stdout, /verify/);
});

test("should tolerate a leading package script separator", async () => {
  const result = await dispatch(["--", "--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Commands:/);
});

test("should keep rendered help stable for the package bin", () => {
  assert.match(renderHelp(), /tn dev --target <web\|desktop>/);
  assert.match(renderHelp(), /tn package --target desktop/);
  assert.match(renderHelp(), /tn animation add-clip <asset-id> <clip-id>/);
  assert.match(renderHelp(), /tn animation graph add-state <asset-id> <state-id>/);
  assert.match(renderHelp(), /tn particle add-emitter <asset-id> <emitter-id>/);
  assert.match(renderHelp(), /tn physics add-rigid-body <scene-id> <entity-id>/);
  assert.match(renderHelp(), /tn physics add-collider <scene-id> <entity-id>/);
  assert.match(renderHelp(), /tn nav add-agent <scene-id> <entity-id>/);
  assert.match(renderHelp(), /tn scene create <scene-id>/);
  assert.match(renderHelp(), /tn scene validate \[scene-id\]/);
  assert.match(renderHelp(), /tn scene inspect <scene-id>/);
  assert.match(renderHelp(), /tn scene add-entity <scene-id> <entity-id>/);
  assert.match(renderHelp(), /tn scene add-prefab-instance <scene-id> <instance-id>/);
  assert.match(renderHelp(), /tn scene layout ten-pin <scene-id>/);
  assert.match(renderHelp(), /tn ui create <ui-doc-id>/);
  assert.match(renderHelp(), /tn material set <material-id>/);
  assert.match(renderHelp(), /tn mesh primitive <mesh-id>/);
  assert.match(renderHelp(), /tn prefab add-component <prefab-id> <component>/);
  assert.match(renderHelp(), /tn prefab set-defaults <prefab-id> <component>/);
  assert.match(renderHelp(), /tn input add-action <input-doc-id> <action-id>/);
  assert.match(renderHelp(), /tn system attach-script <system-id>/);
  assert.match(renderHelp(), /tn editor snapshot --bundle <path>/);
  assert.match(renderHelp(), /tn editor inspect --bundle <path>/);
  assert.match(renderHelp(), /tn editor set --bundle <path> --path <json-pointer> --value <json>/);
  assert.match(renderHelp(), /tn editor apply --snapshot <path> --bundle <path>/);
  assert.match(renderHelp(), /tn compare-images <first\.png> <second\.png>/);
  assert.match(renderHelp(), /tn asset inspect <path-or-directory>/);
  assert.match(renderHelp(), /tn model-test <asset-path>/);
  assert.match(renderHelp(), /tn model-test <asset-path> --view/);
  assert.match(renderHelp(), /--angle <degrees>/);
  assert.match(renderHelp(), /--angles <degrees,\.\.\.>/);
  assert.match(renderHelp(), /tn screenshot \[--project <path>\] --url <preview-url> --out <file\.png>/);
  assert.match(renderHelp(), /tn record \[--project <path>\] --url <preview-url> --out <file\.webm\|file\.mp4>/);
  assert.match(renderHelp(), /tn verify \[--project <path>\] \[--url <preview-url>\]/);
  assert.match(renderHelp(), /tn init <name>/);
  assert.match(renderHelp(), /tn help \[topic\]/);
  assert.doesNotMatch(renderHelp(), /V1 commands:/);
});

test("should keep CLI command metadata unique and help-covered", () => {
  const commandNames = Object.keys(CLI_COMMAND_DEFINITIONS);
  const help = renderHelp();

  assert.deepEqual(commandNames, [...new Set(commandNames)], "CLI command metadata contains duplicate command names.");
  for (const name of commandNames) {
    assert.match(help, new RegExp(`\\b${escapeRegExp(name)}\\b`), `CLI command '${name}' is missing from rendered help.`);
    assert.equal(CLI_COMMAND_DEFINITIONS[name]?.implemented, true, `CLI command '${name}' metadata is not marked implemented.`);
  }
});

test("should keep registry handlers and legacy compatibility path explicit", async () => {
  const source = await readFile(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
  const legacyNames = [...source.matchAll(/commandName === "([^"]+)"/g)].map((match) => match[1]).filter((name): name is string => name !== undefined);
  const uniqueLegacyNames = [...new Set(legacyNames)].sort();
  const registryByName = CLI_COMMAND_REGISTRY as Record<string, (typeof CLI_COMMAND_REGISTRY)[keyof typeof CLI_COMMAND_REGISTRY] | undefined>;
  const registryNames = Object.keys(CLI_COMMAND_REGISTRY).sort();
  const migratedNames = Object.values(CLI_COMMAND_REGISTRY).filter((command) => command.handler !== undefined).map((command) => command.name).sort();

  assert.deepEqual(registryNames, Object.keys(CLI_COMMAND_DEFINITIONS).sort(), "CLI command definitions must be registry-backed.");
  assert.equal(findCommand(CLI_COMMAND_REGISTRY, "build")?.handler, CLI_COMMAND_REGISTRY.build.handler, "Registry lookup must return the migrated command definition.");
  assert.equal(findCommand(CLI_COMMAND_REGISTRY, "missing"), undefined, "Registry lookup must fail closed for unknown commands.");
  assert.deepEqual(migratedNames, ["actor", "bake", "build", "parity", "proof"], "Registry-migrated command list changed without test review.");
  assert.deepEqual(uniqueLegacyNames, UNMIGRATED_COMMAND_FAMILIES, `Legacy compatibility path drift. Legacy=${uniqueLegacyNames.join(", ")} Unmigrated=${UNMIGRATED_COMMAND_FAMILIES.join(", ")}`);
  for (const name of migratedNames) {
    assert.equal(typeof registryByName[name]?.handler, "function", `Migrated command '${name}' must have a registry handler.`);
  }
});

test("dispatch registers physics and nav typed source commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-physics-nav-"));
  try {
    const create = await dispatch(["scene", "create", "scene.physics", "--project", root, "--json"]);
    const entity = await dispatch(["scene", "add-entity", "scene.physics", "player", "--project", root, "--json"]);
    const body = await dispatch(["physics", "add-rigid-body", "scene.physics", "player", "--kind", "dynamic", "--mass", "3", "--project", root, "--json"]);
    const collider = await dispatch(["physics", "add-collider", "scene.physics", "player", "--kind", "capsule", "--radius", "0.4", "--height", "1.8", "--project", root, "--json"]);
    const agent = await dispatch(["nav", "add-agent", "scene.physics", "player", "--move-x", "move.x", "--move-z", "move.z", "--speed", "5", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.physics.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const components = scene.entities.find((item) => item.id === "player")?.components;

    assert.equal(create.exitCode, 0);
    assert.equal(entity.exitCode, 0);
    assert.equal(body.exitCode, 0);
    assert.equal(collider.exitCode, 0);
    assert.equal(agent.exitCode, 0);
    assert.deepEqual(components?.RigidBody, { kind: "dynamic", mass: 3 });
    assert.deepEqual(components?.Collider, { height: 1.8, kind: "capsule", radius: 0.4, size: [1, 1, 1] });
    assert.deepEqual(components?.CharacterController, { blocking: true, grounding: "raycast", moveXAxis: "move.x", moveZAxis: "move.z", speed: 5 });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("physics command writes advanced rigid body and collider fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-physics-advanced-"));
  try {
    const create = await dispatch(["scene", "create", "scene.physics", "--project", root, "--json"]);
    const entity = await dispatch(["scene", "add-entity", "scene.physics", "ball", "--project", root, "--json"]);
    const body = await dispatch([
      "physics",
      "add-rigid-body",
      "scene.physics",
      "ball",
      "--kind",
      "dynamic",
      "--mass",
      "6",
      "--damping",
      "0.08",
      "--gravity-scale",
      "0",
      "--velocity",
      "0.4,0,-8",
      "--angular-velocity",
      "-32,0,-0.8",
      "--enabled-translations",
      "true,false,true",
      "--ccd",
      "true",
      "--ccd-mode",
      "linear",
      "--project",
      root,
      "--json",
    ]);
    const collider = await dispatch([
      "physics",
      "add-collider",
      "scene.physics",
      "ball",
      "--kind",
      "sphere",
      "--radius",
      "0.28",
      "--friction",
      "0.62",
      "--restitution",
      "0.18",
      "--layer",
      "ball",
      "--mask",
      "pin,world",
      "--project",
      root,
      "--json",
    ]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "scene.physics.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
    };
    const components = scene.entities.find((item) => item.id === "ball")?.components;

    assert.equal(create.exitCode, 0);
    assert.equal(entity.exitCode, 0);
    assert.equal(body.exitCode, 0);
    assert.equal(collider.exitCode, 0);
    assert.deepEqual(components?.RigidBody, {
      angularVelocity: [-32, 0, -0.8],
      ccd: { enabled: true, mode: "linear" },
      damping: 0.08,
      enabledTranslations: [true, false, true],
      gravityScale: 0,
      kind: "dynamic",
      mass: 6,
      velocity: [0.4, 0, -8],
    });
    assert.deepEqual(components?.Collider, {
      friction: 0.62,
      kind: "sphere",
      layer: "ball",
      mask: ["pin", "world"],
      radius: 0.28,
      restitution: 0.18,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect scene hierarchy when bundle is valid", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-inspect-"));
  const previousInitCwd = process.env.INIT_CWD;
  try {
    process.env.INIT_CWD = root;
    const bundle = join(root, "game.bundle");
    await writeBundle(bundle);

    const inspected = await dispatch(["editor", "inspect", "--bundle", "game.bundle", "--json"]);
    const payload = JSON.parse(inspected.stdout);

    assert.equal(inspected.exitCode, 0);
    assert.equal(payload.hierarchy[0].id, "player");
    assert.equal(payload.editableProperties.some((property: { path: string }) => property.path === "/documents/world.ir.json/entities/0/components/Transform/position/0"), true);

    const edited = await dispatch(["editor", "set", "--bundle", "game.bundle", "--path", "/documents/world.ir.json/entities/0/components/Transform/position/0", "--value", "2", "--json"]);
    const world = JSON.parse(await readFile(join(bundle, "world.ir.json"), "utf8"));

    assert.equal(edited.exitCode, 0);
    assert.equal(world.entities[0].components.Transform.position[0], 2);
  } finally {
    if (previousInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previousInitCwd;
    }
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBundle(bundle: string): Promise<void> {
  await mkdir(bundle, { recursive: true });
  await writeFile(join(bundle, "manifest.json"), `${JSON.stringify({
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "editor-test",
    requiredCapabilities: {},
    entry: { world: "world.ir.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
  }, null, 2)}\n`);
  await writeFile(join(bundle, "world.ir.json"), `${JSON.stringify({
    schema: "threenative.world",
    version: "0.1.0",
    entities: [{ id: "player", components: { Transform: { position: [0, 0, 0] } } }],
  }, null, 2)}\n`);
  await writeFile(join(bundle, "assets.manifest.json"), `${JSON.stringify({ schema: "threenative.assets", version: "0.1.0", assets: [] }, null, 2)}\n`);
  await writeFile(join(bundle, "materials.ir.json"), `${JSON.stringify({ schema: "threenative.materials", version: "0.1.0", materials: [] }, null, 2)}\n`);
  await writeFile(join(bundle, "target.profile.json"), `${JSON.stringify({ schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] }, null, 2)}\n`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
