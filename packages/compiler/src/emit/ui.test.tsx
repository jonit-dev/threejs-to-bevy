/** @jsxImportSource @threenative/ui */
import assert from "node:assert/strict";
import test from "node:test";

import type { IAssetsManifest, IMaterialsIr, IUiIr } from "@threenative/ir";
import { Bar, Button, Column, Image, Slider, Text, Ui } from "@threenative/ui";

import { emitUi, expandUiComponents, resolveUiThemeTokens } from "./ui.js";
import { deriveRequiredCapabilities } from "./capabilities.js";

test("ui should emit hud and pause ui ir", () => {
  const emitted = emitUi(
    <Ui id="hud">
      <Column id="hud.stack">
        <Text id="hud.health.label" text="Health" />
        <Bar id="hud.health" max={100} binding={{ kind: "resource", name: "Health", field: "current" }} />
        <Button id="hud.pause" label="Pause" action="Pause" focusable />
      </Column>
    </Ui>,
  );

  assert.equal(emitted.schema, "threenative.ui");
  assert.equal(emitted.root.children?.[0]?.kind, "column");
  assert.deepEqual(
    emitted.root.children?.[0]?.children?.map((node) => node.kind),
    ["text", "bar", "button"],
  );
  assert.equal(emitted.root.children?.[0]?.children?.[2]?.action, "Pause");
});

test("should lower theme tokens to retained styles", () => {
  const emitted = resolveUiThemeTokens({
    schema: "threenative.ui",
    version: "0.1.0",
    theme: {
      tokens: [
        { id: "color.panel", kind: "color", value: "#101820cc" },
        { id: "space.panel", kind: "spacing", value: 16 },
        { id: "radius.panel", kind: "radius", value: 8 },
        { id: "font.menu", kind: "fontFamily", value: "menu" },
        { id: "size.title", kind: "textSize", value: 24 },
      ],
    },
    root: {
      id: "hud",
      kind: "column",
      tokenRefs: {
        layout: { padding: "space.panel" },
        style: {
          backgroundColor: "color.panel",
          borderRadius: "radius.panel",
          fontFamily: "font.menu",
          fontSize: "size.title",
        },
      },
    },
  });

  assert.equal(emitted.root.layout?.padding, 16);
  assert.equal(emitted.root.style?.backgroundColor, "#101820cc");
  assert.equal(emitted.root.style?.borderRadius, 8);
  assert.equal(emitted.root.style?.fontFamily, "menu");
  assert.equal(emitted.root.style?.fontSize, 24);
  assert.equal(emitted.root.tokenRefs, undefined);
});

test("should expand reusable UI component with stable node IDs", () => {
  const emitted = expandUiComponents({
    schema: "threenative.ui",
    version: "0.1.0",
    components: [
      {
        id: "inventorySlot",
        props: [{ id: "label", required: true }],
        root: {
          id: "root",
          kind: "button",
          label: "$props.label",
          action: "InspectItem",
          children: [{ id: "count", kind: "text", text: "$props.count" }],
        },
      },
    ],
    root: {
      id: "inventory",
      kind: "row",
      children: [
        { id: "slot.potion", kind: "component", component: { ref: "inventorySlot", props: { count: "3", label: "Potion" } } },
        { id: "slot.key", kind: "component", component: { ref: "inventorySlot", props: { count: "1", label: "Key" } } },
      ],
    },
  });

  assert.deepEqual(
    emitted.root.children?.map((node) => node.id),
    ["slot.potion.root", "slot.key.root"],
  );
  assert.equal(emitted.root.children?.[0]?.label, "Potion");
  assert.equal(emitted.root.children?.[0]?.children?.[0]?.id, "slot.potion.count");
  assert.equal(emitted.root.children?.[0]?.children?.[0]?.text, "3");
});

test("should preserve source provenance for generated UI nodes", () => {
  const emitted = expandUiComponents({
    schema: "threenative.ui",
    version: "0.1.0",
    components: [
      {
        id: "inventorySlot",
        root: { id: "root", kind: "button", label: "Slot", action: "InspectItem" },
      },
    ],
    root: {
      id: "inventory",
      kind: "row",
      children: [{ id: "slot.potion", kind: "component", component: { ref: "inventorySlot" } }],
    },
  });

  assert.deepEqual(emitted.generatedNodeProvenance?.["slot.potion.root"], {
    component: "inventorySlot",
    instance: "slot.potion",
    node: "root",
    sourcePath: "root/children/0/component",
  });
});

test("should emit required font and native style capabilities", () => {
  const emitted = emitUi(
    <Ui id="hud" fonts={[{ asset: "assets/fonts/menu.ttf", family: "menu", glyphRanges: [{ from: 32, to: 126 }] }]}>
      <Text
        id="hud.title"
        spans={[
          { text: "Paused", fontFamily: "menu", fontSize: 24, weight: "bold", decoration: "underline" },
        ]}
        style={{ fontFamily: "menu", fontSize: 18, fontWeight: "bold", textDecoration: "underline" }}
      />
    </Ui>,
  );

  const capabilities = deriveRequiredCapabilities({ assets: emptyAssets(), materials: emptyMaterials(), ui: emitted as IUiIr });

  assert.equal(emitted.fonts?.[0]?.family, "menu");
  assert.equal(emitted.root.children?.[0]?.spans?.[0]?.fontFamily, "menu");
  assert.deepEqual(capabilities.ui?.filter((capability) => capability.startsWith("font.") || capability === "font-assets" || capability === "rich-text" || capability === "style.text"), [
    "font-assets",
    "font.menu",
    "rich-text",
    "style.text",
  ]);
});

test("should emit image metadata and widget capabilities", () => {
  const emitted = emitUi(
    <Ui id="hud">
      <Column id="settings">
        <Image
          id="panel"
          accessibilityLabel="Settings panel"
          src="assets/panel.png"
          image={{
            nineSlice: { left: 8, right: 8, top: 8, bottom: 8 },
            scaleMode: "stretch",
            sourceSize: { width: 64, height: 64 },
          }}
        />
        <Slider id="volume" accessibilityLabel="Volume" action="SetVolume" min={0} max={1} value={0.5} step={0.05} />
      </Column>
    </Ui>,
  );

  const capabilities = deriveRequiredCapabilities({ assets: emptyAssets(), materials: emptyMaterials(), ui: emitted as IUiIr });

  assert.equal(emitted.root.children?.[0]?.children?.[0]?.image?.nineSlice?.left, 8);
  assert.deepEqual(
    capabilities.ui?.filter((capability) => capability.startsWith("image.") || capability.startsWith("widget")),
    ["image.metadata", "image.nine-slice", "widget", "widget.slider"],
  );
});

test("should report text input widget capabilities", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: emptyAssets(),
    materials: emptyMaterials(),
    ui: {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "settings",
        kind: "column",
        children: [{ id: "player-name", kind: "textInput", label: "Player name", action: "SetPlayerName", text: "Hero" }],
      },
    },
  });

  assert.deepEqual(
    capabilities.ui?.filter((capability) => capability.startsWith("widget")),
    ["widget", "widget.textInput"],
  );
});

function emptyAssets(): IAssetsManifest {
  return { assets: [], schema: "threenative.assets", version: "0.1.0" };
}

function emptyMaterials(): IMaterialsIr {
  return { materials: [], schema: "threenative.materials", version: "0.1.0" };
}
