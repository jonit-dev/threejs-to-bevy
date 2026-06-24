/** @jsxImportSource @threenative/ui */
import assert from "node:assert/strict";
import test from "node:test";

import type { IAssetsManifest, IMaterialsIr, IUiIr } from "@threenative/ir";
import { Bar, Button, Column, Image, Slider, Text, Ui } from "@threenative/ui";

import { emitUi } from "./ui.js";
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
