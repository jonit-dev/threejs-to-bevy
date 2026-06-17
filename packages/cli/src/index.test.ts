import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatch, renderHelp } from "./index.js";

test("should print help when requested", async () => {
  const result = await dispatch(["--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /V1 commands:/);
  assert.match(result.stdout, /create/);
  assert.match(result.stdout, /validate/);
  assert.match(result.stdout, /build/);
  assert.match(result.stdout, /compare-images/);
  assert.match(result.stdout, /dev/);
  assert.match(result.stdout, /editor/);
  assert.match(result.stdout, /package/);
  assert.match(result.stdout, /verify/);
});

test("should tolerate a leading package script separator", async () => {
  const result = await dispatch(["--", "--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /V1 commands:/);
});

test("should keep rendered help stable for the package bin", () => {
  assert.match(renderHelp(), /tn dev --target <web\|desktop>/);
  assert.match(renderHelp(), /tn package --target desktop/);
  assert.match(renderHelp(), /tn editor snapshot --bundle <path>/);
  assert.match(renderHelp(), /tn editor inspect --bundle <path>/);
  assert.match(renderHelp(), /tn editor set --bundle <path> --path <json-pointer> --value <json>/);
  assert.match(renderHelp(), /tn editor apply --snapshot <path> --bundle <path>/);
  assert.match(renderHelp(), /tn compare-images <first\.png> <second\.png>/);
  assert.match(renderHelp(), /tn verify \[--project <path>\] \[--url <preview-url>\]/);
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
