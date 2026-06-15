import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("ui should reject dom event handler", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-handler-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "pause",
        kind: "button",
        label: "Pause",
        action: "Pause",
        onClick: "window.alert('no')",
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_UI_FIELD_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject duplicate node IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-duplicate-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "column",
        children: [
          { id: "pause", kind: "button", label: "Pause", action: "Pause" },
          { id: "pause", kind: "text", text: "Paused" },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_UI_ID_DUPLICATE");
    assert.equal(result.diagnostics[0]?.path, "ui.ir.json/root/children/1/id");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should validate v7 focus navigation metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-navigation-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      focusOrder: ["play", "missing"],
      safeArea: { mode: "avoid", edges: ["top", "diagonal"] },
      inputActions: { activate: "UiActivate", next: "" },
      root: {
        id: "menu",
        kind: "column",
        children: [
          { id: "play", kind: "button", label: "Play", action: "Start", navigation: { down: "missing" } },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_UI_FOCUS_TARGET_INVALID",
        "TN_IR_UI_SAFE_AREA_EDGE_INVALID",
        "TN_IR_UI_INPUT_ACTION_INVALID",
        "TN_IR_UI_NAVIGATION_TARGET_INVALID",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should validate explicit flex layout metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-layout-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "row",
        layout: { align: "center", columnGap: 12, direction: "row", height: 48, inset: { left: 24, top: 16 }, justify: "spaceBetween", maxWidth: 480, minHeight: 24, overflow: "hidden", padding: 6, position: "absolute", rowGap: 4, width: 320, zIndex: 5 },
        children: [{ id: "score", kind: "text", text: "0" }],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject invalid flex layout metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-layout-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "row",
        layout: { align: "baseline", direction: "diagonal", grow: -1, inset: { center: 10, left: -1 }, justify: "around", maxWidth: -1, minHeight: Number.POSITIVE_INFINITY, overflow: "scroll", position: "fixed", zIndex: 0.5 },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_DIRECTION_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_ALIGN_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_JUSTIFY_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_OVERFLOW_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_POSITION_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_INSET_FIELD_UNSUPPORTED"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_INSET_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_NUMBER_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_Z_INDEX_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
