import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateOverlayPayload, validateOverlaysIr } from "./overlays.js";
import { validateBundle } from "./validate.js";

test("validates desktop webview overlay declarations", () => {
  const diagnostics = validateOverlaysIr(validOverlaysIr());

  assert.deepEqual(diagnostics, []);
});

test("rejects unsafe overlay entries", () => {
  const diagnostics = [
    "/overlay/index.html",
    "../overlay/index.html",
    "https://example.com/overlay.html",
    "<script>alert(1)</script>",
  ].flatMap((entry) => validateOverlaysIr(validOverlaysIr({ entry })));

  assert.equal(diagnostics.every((diagnostic) => diagnostic.code === "TN_IR_OVERLAY_ENTRY_INVALID"), true);
});

test("rejects invalid overlay bridge schemas", () => {
  const diagnostics = validateOverlaysIr(
    validOverlaysIr({
      messages: {
        overlayToGame: [
          { name: "UseItem", schema: { kind: "object", fields: { itemId: "string" }, required: ["itemId"] } },
          { name: "inventory:drop-item", schema: { kind: "object", fields: { "bad-name": "uuid" }, required: ["missing"] } },
        ],
      },
    }),
  );

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_OVERLAY_MESSAGE_NAME_INVALID"), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_OVERLAY_MESSAGE_SCHEMA_INVALID"), true);
});

test("validates optional overlay layout rectangles in version 0.2.0", () => {
  assert.deepEqual(validateOverlaysIr({ ...validOverlaysIr({ layout: { height: 180, width: 320, x: 12, y: 16 } }), version: "0.2.0" }), []);
  assert.deepEqual(validateOverlaysIr({ ...validOverlaysIr({ layout: { mode: "viewport" } }), version: "0.2.0" }), []);
  assert.equal(validateOverlaysIr({ ...validOverlaysIr({ layout: { height: 0, width: 320, x: 12, y: 16 } }), version: "0.2.0" })[0]?.code, "TN_IR_OVERLAY_LAYOUT_INVALID");
  assert.equal(validateOverlaysIr({ ...validOverlaysIr({ layout: { mode: "viewport", width: 320 } }), version: "0.2.0" })[0]?.code, "TN_IR_OVERLAY_LAYOUT_INVALID");
});

test("should reject payload over 16KB when direction is gameToOverlay", () => {
  const result = validateOverlayPayload(
    { value: "x".repeat(17 * 1024) },
    { fields: { value: "string" }, kind: "object", required: ["value"] },
  );

  assert.deepEqual(result, { code: "TN_OVERLAY_PAYLOAD_TOO_LARGE", valid: false });
});

test("validates shared overlay payload conformance vectors", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/overlay-payload-validation.json", import.meta.url), "utf8")) as {
    schema: Parameters<typeof validateOverlayPayload>[1];
    vectors: Array<{ code?: string; name: string; paddingBytes?: number; payload: Record<string, unknown>; valid: boolean }>;
  };
  for (const vector of fixture.vectors) {
    const payload = vector.paddingBytes === undefined ? vector.payload : { ...vector.payload, label: "x".repeat(vector.paddingBytes) };
    const result = validateOverlayPayload(payload, fixture.schema);
    assert.equal(result.valid, vector.valid, vector.name);
    assert.equal(result.code, vector.code, vector.name);
  }
});

test("validates overlays through bundle manifest entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-overlays-bundle-"));
  try {
    await writeBaseBundle(root);
    await writeJson(root, "overlay/index.html", "<!doctype html><div>Inventory</div>");
    await writeJson(root, "overlays.ir.json", validOverlaysIr());
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "overlay-test",
      requiredCapabilities: { overlay: ["bridge", "input.pointer", "target.desktop", "transparent", "webview"] },
      entry: { overlays: "overlays.ir.json", world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function validOverlaysIr(overrides: Record<string, unknown> = {}) {
  return {
    schema: "threenative.overlays",
    version: "0.1.0",
    overlays: [
      {
        entry: "overlay/index.html",
        id: "inventory",
        input: "pointer",
        messages: {
          gameToOverlay: [
            { name: "inventory:snapshot", schema: { kind: "object", fields: { gold: "integer" }, required: ["gold"] } },
          ],
          overlayToGame: [
            { name: "inventory:use-item", schema: { kind: "object", fields: { itemId: "string" }, required: ["itemId"] } },
          ],
        },
        targetProfiles: ["desktop", "web"],
        transparent: true,
        zIndex: 20,
        ...overrides,
      },
    ],
  };
}

async function writeBaseBundle(root: string): Promise<void> {
  await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web", "desktop"] });
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await mkdir(join(root, file, ".."), { recursive: true });
  await writeFile(join(root, file), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}
