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
        layout: { align: "center", columnGap: 12, direction: "row", grid: { autoFlow: "row", columns: 3, rows: 2 }, height: 48, inset: { left: 24, top: 16 }, justify: "spaceBetween", maxWidth: 480, minHeight: 24, overflow: "scroll", padding: 6, position: "absolute", rowGap: 4, width: 320, zIndex: 5 },
        style: { backgroundColor: "#101820cc", borderColor: "#ffffff", borderRadius: 8, borderWidth: 2, color: "#ffcc00", fontSize: 18, fontWeight: "bold", gradient: { angle: 90, from: "#101820", kind: "linear", to: "#203040" }, opacity: 0.75, shadow: { blur: 12, color: "#00000080", offsetX: 0, offsetY: 4, spread: 1 }, textAlign: "center", textDecoration: "underline", wrap: "word" },
        children: [
          { id: "score", kind: "text", text: "0" },
          { id: "portrait", kind: "image", accessibilityLabel: "Hero portrait", role: "image", src: "assets/hero.png" },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should validate rich text spans with bundle local font assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-rich-text-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      fonts: [{ asset: "assets/fonts/menu.ttf", family: "menu", glyphRanges: [{ from: 32, to: 126 }], weight: "bold" }],
      root: {
        id: "title",
        kind: "text",
        accessibilityLabel: "Paused menu title",
        spans: [
          { text: "Paused", fontFamily: "menu", fontSize: 24, weight: "bold", color: "#ffffff", decoration: "underline" },
          { text: "!", accessibilityText: " exclamation mark", fontFamily: "menu", italic: true },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject rich text span when font asset is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-rich-text-missing-font-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "title",
        kind: "text",
        spans: [{ text: "Paused", fontFamily: "missing" }],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_UI_FONT_MISSING");
    assert.equal(result.diagnostics[0]?.path, "ui.ir.json/root/spans/0/fontFamily");
    assert.match(result.diagnostics[0]?.suggestion ?? "", /ui\.fonts/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should validate nine slice image metadata when insets fit source size", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-nine-slice-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "panel",
        kind: "image",
        accessibilityLabel: "Inventory panel",
        role: "image",
        src: "assets/panel.png",
        image: {
          atlas: { x: 0, y: 0, width: 64, height: 64 },
          nineSlice: { left: 8, right: 8, top: 8, bottom: 8 },
          scaleMode: "stretch",
          sourceSize: { width: 64, height: 64 },
          tint: "#ffffffff",
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject atlas rect outside image bounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-atlas-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "icon",
        kind: "image",
        accessibilityLabel: "Potion",
        role: "image",
        src: "assets/icons.png",
        image: {
          atlas: { x: 48, y: 48, width: 32, height: 32 },
          sourceSize: { width: 64, height: 64 },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_UI_IMAGE_ATLAS_BOUNDS_INVALID");
    assert.equal(result.diagnostics[0]?.path, "ui.ir.json/root/image/atlas");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject invalid image metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-image-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "row",
        children: [
          { id: "missing", kind: "image" },
          { id: "absolute", kind: "image", src: "/assets/hero.png" },
          { id: "parent", kind: "image", src: "../hero.png" },
          { id: "remote", kind: "image", src: "https://example.com/hero.png" },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_IMAGE_SRC_MISSING"), true);
    assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_UI_IMAGE_SRC_INVALID").length, 3);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ACCESSIBILITY_LABEL_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject invalid accessibility metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-accessibility-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "row",
        children: [
          { id: "icon-button", kind: "button", action: "Open" },
          { id: "bad-role", kind: "text", text: "Score", role: "heading" },
          { id: "bad-label", kind: "image", accessibilityLabel: "", src: "assets/icon.png" },
          { id: "focusable-panel", kind: "row", focusable: true },
          { id: "meter", kind: "bar", value: 1, max: 2 },
          { id: "status", kind: "row", role: "progressbar" },
          { id: "menu", kind: "column", role: "list", children: [{ id: "play", kind: "text", text: "Play" }] },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ACCESSIBILITY_LABEL_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ACCESSIBILITY_LABEL_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ACCESSIBILITY_ROLE_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ACCESSIBILITY_FOCUSABLE_NAME_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ACCESSIBILITY_PROGRESS_NAME_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ACCESSIBILITY_LISTITEM_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject unsupported world-space UI requests with explicit diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-world-ui-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "world-label",
        kind: "text",
        text: "Nameplate",
        worldSpace: true,
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_WORLD_SPACE_UNSUPPORTED"), true);
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
        layout: { align: "baseline", direction: "diagonal", grid: { autoFlow: "dense", columns: 0, extra: true }, grow: -1, inset: { center: 10, left: -1 }, justify: "around", maxWidth: -1, minHeight: Number.POSITIVE_INFINITY, overflow: "clip", position: "fixed", zIndex: 0.5 },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_DIRECTION_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_ALIGN_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_JUSTIFY_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_OVERFLOW_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_POSITION_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_GRID_FIELD_UNSUPPORTED"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_GRID_AUTO_FLOW_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_GRID_TRACK_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_INSET_FIELD_UNSUPPORTED"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_INSET_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_NUMBER_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_Z_INDEX_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject invalid style metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-style-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "row",
        style: {
          backgroundColor: "blue",
          borderColor: "#12345",
          borderRadius: -1,
          borderWidth: Number.POSITIVE_INFINITY,
          color: "#000000",
          fontSize: -4,
          fontWeight: "heavy",
          opacity: 1.5,
          textAlign: "middle",
          textDecoration: "blink",
          wrap: "always",
          gradient: { angle: Number.NaN, from: "red", kind: "radial", to: "#ffffff", via: "#000000" },
          shadow: { blur: -1, color: "black", offsetX: Number.POSITIVE_INFINITY, spread: -2, extra: 1 },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_FIELD_UNSUPPORTED"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_COLOR_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_GRADIENT_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_FONT_WEIGHT_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_NUMBER_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_OPACITY_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_TEXT_ALIGN_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_TEXT_DECORATION_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_STYLE_WRAP_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
