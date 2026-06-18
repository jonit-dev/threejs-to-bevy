import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadBundle, validateAndLoadBundle, WebBundleValidationError } from "./loadBundle.js";

test("loadBundle should load optional ui and audio ir", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-ui-bundle-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "ui",
      requiredCapabilities: {},
      entry: { world: "world.ir.json", audio: "audio.ir.json", ui: "ui.ir.json" },
      files: {
        assets: "assets.manifest.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
      },
    });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [],
      resources: {},
    });
    await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "target.profile.json", {
      schema: "threenative.target-profile",
      version: "0.1.0",
      targets: ["web"],
    });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "stack",
        children: [{ id: "hud.pause", kind: "button", action: "Pause", label: "Pause" }],
      },
    });
    await writeJson(root, "audio.ir.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      music: [{ id: "music.arena", asset: "arena.music", autoplay: true, loop: true }],
      oneShots: [],
    });

    const bundle = await loadBundle(root);

    assert.equal(bundle.audio?.music[0]?.asset, "arena.music");
    assert.equal(bundle.ui?.root.children?.[0]?.kind, "button");
    assert.equal(bundle.ui?.root.children?.[0]?.action, "Pause");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should validate and load a valid local bundle when validation is requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-validated-bundle-"));
  try {
    await writeMinimalBundle(root);

    const bundle = await validateAndLoadBundle(root);

    assert.equal(bundle.manifest.name, "validated");
    assert.deepEqual(bundle.world.entities, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject invalid local bundle before hydration when validation is requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-invalid-validated-bundle-"));
  try {
    await writeMinimalBundle(root);
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        { id: "duplicate", components: {} },
        { id: "duplicate", components: {} },
      ],
    });

    await assert.rejects(
      () => validateAndLoadBundle(root),
      (error) => {
        assert.ok(error instanceof WebBundleValidationError);
        assert.equal(error.diagnostics[0]?.code, "TN_IR_DUPLICATE_ENTITY_ID");
        assert.equal(error.diagnostics[0]?.path, "world.ir.json/entities/1/id");
        return true;
      },
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve unchecked loadBundle compatibility by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-unchecked-bundle-"));
  try {
    await writeMinimalBundle(root);
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        { id: "duplicate", components: {} },
        { id: "duplicate", components: {} },
      ],
    });

    const bundle = await loadBundle(root);

    assert.equal(bundle.world.entities.length, 2);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject fetchable bundle validation explicitly", async () => {
  await assert.rejects(
    () => validateAndLoadBundle("https://example.invalid/game.bundle"),
    /Bundle validation for fetchable sources is not supported yet/,
  );
});

async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), `${JSON.stringify(value)}\n`);
}

async function writeMinimalBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "validated",
    requiredCapabilities: {},
    entry: { world: "world.ir.json" },
    files: {
      assets: "assets.manifest.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
    },
  });
  await writeJson(root, "world.ir.json", {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [],
  });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "target.profile.json", {
    schema: "threenative.target-profile",
    version: "0.1.0",
    targets: ["web"],
  });
}
