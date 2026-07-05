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

test("ui should accept text input widgets with deterministic value actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-text-input-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "settings",
        kind: "column",
        children: [
          {
            id: "player-name",
            kind: "textInput",
            label: "Player name",
            action: "SetPlayerName",
            text: "Hero",
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should accept formatted resource bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-format-binding-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "column",
        children: [
          {
            id: "checkpoint",
            kind: "text",
            binding: { fields: ["checkpoint", "total"], format: "CP {checkpoint}/{total}", kind: "resource", name: "Race" },
          },
          {
            id: "timer",
            kind: "text",
            binding: { field: "seconds", format: "Time {seconds:fixed1}", kind: "resource", name: "Race" },
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject invalid formatted resource bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-format-binding-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "column",
        children: [
          {
            id: "checkpoint",
            kind: "text",
            binding: { fields: ["checkpoint"], format: "CP {checkpoint}/{total}", kind: "resource", name: "Race" },
          },
          {
            id: "timer",
            kind: "text",
            binding: { field: "seconds", format: "Time {seconds:precision2}", kind: "resource", name: "Race" },
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.path.endsWith("/binding/format")).map((diagnostic) => diagnostic.code),
      ["TN_IR_UI_BINDING_FORMAT_FIELD_MISSING", "TN_IR_UI_BINDING_FORMAT_INVALID"],
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
      fonts: [{ asset: "assets/fonts/menu.ttf", family: "menu" }],
      root: {
        id: "hud",
        kind: "row",
        layout: { align: "center", columnGap: 12, direction: "row", grid: { autoFlow: "row", columns: 3, rows: 2 }, height: 48, inset: { left: 24, top: 16 }, justify: "spaceBetween", maxWidth: 480, minHeight: 24, overflow: "scroll", padding: 6, position: "absolute", rowGap: 4, width: 320, zIndex: 5 },
        style: { backgroundColor: "#101820cc", borderColor: "#ffffff", borderRadius: 8, borderWidth: 2, color: "#ffcc00", fontFamily: "menu", fontSize: 18, fontWeight: "bold", gradient: { angle: 90, from: "#101820", kind: "linear", to: "#203040" }, opacity: 0.75, shadow: { blur: 12, color: "#00000080", offsetX: 0, offsetY: 4, spread: 1 }, textAlign: "center", textDecoration: "underline", wrap: "word" },
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

test("ui should accept bounded UI theme tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-theme-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      theme: {
        tokens: [
          { id: "color.panel", kind: "color", value: "#101820cc" },
          { id: "space.panel", kind: "spacing", value: 16 },
          { id: "radius.panel", kind: "radius", value: 8 },
        ],
        componentVariants: [
          {
            id: "panel",
            tokenRefs: {
              layout: { padding: "space.panel" },
              style: { backgroundColor: "color.panel", borderRadius: "radius.panel" },
            },
          },
        ],
      },
      root: {
        id: "hud",
        kind: "column",
        tokenRefs: {
          layout: { padding: "space.panel" },
          style: { backgroundColor: "color.panel", borderRadius: "radius.panel" },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject unresolved UI token references", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-token-missing-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      theme: { tokens: [{ id: "color.panel", kind: "color", value: "#101820cc" }] },
      root: {
        id: "hud",
        kind: "column",
        tokenRefs: {
          layout: { padding: "space.missing" },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_UI_TOKEN_REF_UNRESOLVED");
    assert.equal(result.diagnostics[0]?.path, "ui.ir.json/root/tokenRefs/layout/padding");
    assert.match(result.diagnostics[0]?.message ?? "", /space\.missing/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject circular UI token aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-token-cycle-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      theme: {
        tokens: [
          { id: "space.a", kind: "spacing", value: { alias: "space.b" } },
          { id: "space.b", kind: "spacing", value: { alias: "space.a" } },
        ],
      },
      root: { id: "hud", kind: "column" },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_THEME_TOKEN_ALIAS_CYCLE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should accept reusable UI component instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-component-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      components: [
        {
          id: "inventorySlot",
          props: [{ id: "label", required: true }],
          root: { id: "root", kind: "button", label: "$props.label", action: "InspectItem" },
        },
      ],
      root: {
        id: "inventory",
        kind: "row",
        children: [
          { id: "slot.potion", kind: "component", component: { ref: "inventorySlot", props: { label: "Potion" } } },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject component instances with missing required props", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-component-prop-missing-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      components: [
        {
          id: "inventorySlot",
          props: [{ id: "label", required: true }],
          root: { id: "root", kind: "button", label: "$props.label", action: "InspectItem" },
        },
      ],
      root: {
        id: "inventory",
        kind: "row",
        children: [
          { id: "slot.potion", kind: "component", component: { ref: "inventorySlot", props: {} } },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_COMPONENT_PROP_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject component instances that generate duplicate node IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-component-generated-duplicate-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      components: [
        {
          id: "inventorySlot",
          root: { id: "label", kind: "text", text: "Potion" },
        },
      ],
      root: {
        id: "inventory",
        kind: "row",
        children: [
          { id: "slot", kind: "component", component: { ref: "inventorySlot" } },
          { id: "slot.label", kind: "text", text: "Collision" },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_COMPONENT_GENERATED_ID_DUPLICATE"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should accept screen stack and focus scope metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-screen-stack-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      focusOrder: ["resume", "confirm.cancel"],
      screens: [
        {
          id: "pause",
          role: "menu",
          root: "pause.panel",
          stackPolicy: "push",
          focusScope: { entry: "resume", inputCapture: "keyboard", restore: "previous" },
        },
        {
          id: "confirm",
          role: "modal",
          root: "confirm.dialog",
          stackPolicy: "exclusiveModal",
          focusScope: { entry: "confirm.cancel", escapeAction: "UiCancel", inputCapture: "modal", restore: "previous", trap: true },
        },
      ],
      screenStack: {
        active: ["pause", "confirm"],
        policy: "exclusiveModal",
        transitions: [{ from: "pause", kind: "exclusiveModal", to: "confirm" }],
      },
      root: {
        id: "ui.root",
        kind: "stack",
        children: [
          { id: "pause.panel", kind: "column", children: [{ id: "resume", kind: "button", label: "Resume", action: "Resume" }] },
          { id: "confirm.dialog", kind: "column", children: [{ id: "confirm.cancel", kind: "button", label: "Cancel", action: "UiCancel" }] },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject modal focus trap without exit action", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-modal-trap-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      screens: [
        {
          id: "confirm",
          role: "modal",
          root: "confirm.dialog",
          stackPolicy: "exclusiveModal",
          focusScope: { entry: "confirm.cancel", inputCapture: "none", trap: true },
        },
      ],
      screenStack: { active: ["confirm"], policy: "exclusiveModal" },
      root: {
        id: "confirm.dialog",
        kind: "column",
        children: [{ id: "confirm.cancel", kind: "button", label: "Cancel", action: "UiCancel" }],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
      [
        ["TN_IR_UI_FOCUS_TRAP_EXIT_MISSING", "ui.ir.json/screens/0/focusScope"],
        ["TN_IR_UI_MODAL_CAPTURE_MISSING", "ui.ir.json/screens/0/focusScope/inputCapture"],
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject large list without virtualized range policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-large-list-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "inventory",
        kind: "column",
        children: Array.from({ length: 101 }, (_, index) => ({
          id: `item.${index}`,
          kind: "button",
          label: `Item ${index}`,
          action: "InspectItem",
        })),
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_VIRTUAL_RANGE_REQUIRED" && diagnostic.path === "ui.ir.json/root/virtualRange"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept input glyph prompt for declared action", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-glyph-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "interact",
        kind: "button",
        label: "Open",
        action: "Interact",
        glyph: { action: "Interact", glyphSet: "gamepad", label: "A" },
        tooltip: { anchor: "interact", description: "Open the selected chest.", dismissAction: "Cancel", focus: "preserve", open: "focus", delayMs: 250 },
        feedback: [{ trigger: "activate", audio: "ui.confirm" }],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject localization key without fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-localization-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "quest.prompt",
        kind: "text",
        localization: { key: "quest.prompt" },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_UI_LOCALIZATION_FALLBACK_MISSING");
    assert.equal(result.diagnostics[0]?.path, "ui.ir.json/root/localization/fallback");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept bounded UI glow effect preset", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-effect-glow-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "quest.target",
        kind: "button",
        label: "Ancient Door",
        action: "InspectQuestTarget",
        effects: [
          {
            color: "#66ccff",
            fallback: "shadow",
            id: "selected.glow",
            intensity: 0.75,
            kind: "glow",
            radius: 12,
            trigger: "selected",
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject custom UI shader effect", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-effect-shader-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "critical.health",
        kind: "bar",
        effects: [
          {
            id: "custom.shader",
            kind: "glow",
            shaderRef: "materials/ui-critical.wgsl",
            trigger: "predicate",
            predicate: { resource: "PlayerVitals", field: "critical", equals: true },
          },
        ],
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_EFFECT_ESCAPE_UNSUPPORTED" && diagnostic.path === "ui.ir.json/root/effects/0/shaderRef"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject attached UI target that is not a declared entity", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-attachment-target-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json", world: "world.ir.json" } } });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [{ id: "player", components: { Transform: { position: [0, 0, 0] } } }],
    });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "enemy.nameplate",
        kind: "text",
        text: "Scout",
        attachTo: {
          target: { kind: "entity", id: "missing.enemy" },
          localOffset: [0, 2, 0],
          anchor: "top",
          clamp: "screenEdge",
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_ATTACHMENT_TARGET_UNDECLARED" && diagnostic.path === "ui.ir.json/root/attachTo/target/id" && diagnostic.message.includes("missing.enemy")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ui should reject unsupported typography policy fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-typography-unsupported-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "title",
        kind: "text",
        text: "Paused",
        style: {
          fontFamily: "system-ui",
          fontVariationSettings: "\"wght\" 650",
          letterSpacing: 1.25,
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_FONT_FAMILY_UNSUPPORTED" && diagnostic.path === "ui.ir.json/root/style/fontFamily"), true);
    assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_UI_TYPOGRAPHY_UNSUPPORTED").length, 2);
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
        renderToTexture: "hud-target",
        text: "Nameplate",
        transform: { rotate: 15 },
        worldSpace: true,
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_TRANSFORM_UNSUPPORTED"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_RENDER_TO_TEXTURE_UNSUPPORTED"), true);
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

test("ui should reject advanced grid placement and dense packing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-grid-advanced-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { ui: "ui.ir.json" } } });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "inventory",
        kind: "column",
        layout: {
          grid: {
            autoFlow: "dense",
            columns: 4,
            namedAreas: ["header header", "slot-a slot-b"],
            placement: { "slot-a": { column: 1, row: 2 } },
          },
        },
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    const advancedDiagnostics = result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_GRID_ADVANCED_UNSUPPORTED");
    assert.equal(advancedDiagnostics.length, 3);
    assert.equal(advancedDiagnostics.every((diagnostic) => diagnostic.path.startsWith("ui.ir.json/root/layout/grid/")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_UI_LAYOUT_GRID_AUTO_FLOW_INVALID"), true);
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
