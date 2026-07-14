import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { PNG } from "pngjs";

import { UI_PARITY_ROWS, promotedUiCapabilitiesForFixture, requiredUiParityArtifacts, uiParityRowsForArtifact } from "./uiParityRegistry.js";
import { validateUiNativeReport } from "./uiNative.js";

const runId = "test-run-123";

test("should accept complete run-bound UI evidence", async () => {
  const fixture = makeFixture();
  assert.deepEqual(await validate(fixture), []);
});

test("should reject a valid PNG that has no rendered information", async () => {
  const fixture = makeFixture();
  const path = "tools/verify/artifacts/feature-parity-ui-native/viewports/mobile/native.png";
  fixture.artifacts.set(path, png(390, 844, false));
  fixture.report = makeReport(fixture.artifacts);
  const diagnostics = await validate(fixture);
  assert.equal(diagnostics.some((entry) => entry.code === "TN_VERIFY_UI_NATIVE_SCREENSHOT_EMPTY" && entry.path === path), true);
});

test("should reject an empty behavior proof even when marked passing", async () => {
  const fixture = makeFixture();
  const path = "tools/verify/artifacts/feature-parity-ui-native/behavior/native.json";
  fixture.artifacts.set(path, json({ adapter: "native", actions: [], ok: true, runId, schema: "threenative.ui-parity-behavior", version: "0.1.0" }));
  fixture.report = makeReport(fixture.artifacts);
  const diagnostics = await validate(fixture);
  assert.equal(diagnostics.some((entry) => entry.code === "TN_VERIFY_UI_NATIVE_BEHAVIOR_INVALID" && entry.path === path), true);
});

test("should reject stale evidence hashes from a previous report", async () => {
  const fixture = makeFixture();
  const path = "tools/verify/artifacts/feature-parity-ui-native/accessibility/native.json";
  fixture.artifacts.set(path, `${fixture.artifacts.get(path) as string}\n`);
  const diagnostics = await validate(fixture);
  assert.equal(diagnostics.some((entry) => entry.code === "TN_VERIFY_UI_NATIVE_MANIFEST_ENTRY_INVALID" && entry.path === path), true);
});

test("should reject a hash-bound diff that is not derived from the paired pixels", async () => {
  const fixture = makeFixture();
  const path = "tools/verify/artifacts/feature-parity-ui-native/viewports/mobile/diff.png";
  fixture.artifacts.set(path, png(390, 844, true));
  const viewportPath = "tools/verify/artifacts/feature-parity-ui-native/viewport-report.json";
  const viewportReport = JSON.parse(fixture.artifacts.get(viewportPath) as string) as { viewports: { mobile: { comparison: { sha256: string } } } };
  viewportReport.viewports.mobile.comparison.sha256 = hash(fixture.artifacts.get(path)!);
  fixture.artifacts.set(viewportPath, json(viewportReport));
  fixture.report = makeReport(fixture.artifacts);
  const diagnostics = await validate(fixture);
  assert.equal(diagnostics.some((entry) => entry.code === "TN_VERIFY_UI_NATIVE_DIFF_INVALID" && entry.path === path), true);
});

test("should reject accessibility snapshots that echo roles without exercised state and values", async () => {
  const fixture = makeFixture();
  const path = "tools/verify/artifacts/feature-parity-ui-native/accessibility/native.json";
  fixture.artifacts.set(path, json({ adapter: "native", nodes: [], runId, schema: "threenative.ui-accessibility-snapshot", version: "0.1.0" }));
  fixture.report = makeReport(fixture.artifacts);
  const diagnostics = await validate(fixture);
  assert.equal(diagnostics.some((entry) => entry.code === "TN_VERIFY_UI_NATIVE_ACCESSIBILITY_INVALID" && entry.path === path), true);
});

function makeFixture(): { artifacts: Map<string, string | Uint8Array>; report: Record<string, unknown> } {
  const artifacts = new Map<string, string | Uint8Array>();
  for (const path of requiredUiParityArtifacts()) {
    if (path.endsWith(".png")) {
      const mobile = path.includes("/mobile/");
      artifacts.set(path, png((mobile ? 390 : 1280) * (path.endsWith("contact-sheet.png") ? 2 : 1), mobile ? 844 : 720, true));
    }
  }
  for (const name of ["desktop", "mobile"]) {
    const base = `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}`;
    artifacts.set(`${base}/contact-sheet.png`, contact(artifacts.get(`${base}/web.png`)!, artifacts.get(`${base}/native.png`)!));
    artifacts.set(`${base}/diff.png`, diff(artifacts.get(`${base}/web.png`)!, artifacts.get(`${base}/native.png`)!));
  }
  artifacts.set("tools/verify/artifacts/feature-parity-ui-native/behavior/web.json", json(behavior("web")));
  artifacts.set("tools/verify/artifacts/feature-parity-ui-native/behavior/native.json", json(behavior("native")));
  artifacts.set("tools/verify/artifacts/feature-parity-ui-native/accessibility/web.json", json(accessibility("web")));
  artifacts.set("tools/verify/artifacts/feature-parity-ui-native/accessibility/native.json", json(accessibility("native")));
  artifacts.set("tools/verify/artifacts/feature-parity-ui-native/native-trace.json", json({
    attachments: { projections: [{ node: "enemy.nameplate" }] },
    schema: "threenative.ui-native-trace",
    visualEffects: { effects: [{ gradient: {}, node: "advanced.ui", shadow: {} }] },
  }));
  const diagnosticEntries = ([
    ["TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY", "runtime-bevy/crates/threenative_runtime/src/ui.rs"],
    ["TN_BEVY_UI_HORIZONTAL_SCROLL_PARTIAL", "runtime-bevy/crates/threenative_runtime/src/ui.rs"],
    ["TN_BEVY_UI_NESTED_SCROLL_PARTIAL", "runtime-bevy/crates/threenative_runtime/src/ui.rs"],
    ["TN_CATALOG_UI_IME_TARGET_UNSUPPORTED", "packages/ir/src/bevyCatalogResiduals.ts"],
    ["TN_INPUT_UI_VIRTUAL_KEYBOARD_DIAGNOSTIC_ONLY", "packages/runtime-web-three/src/inputUiPolish.ts"],
    ["TN_IR_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED", "packages/ir/src/uiValidation.ts"],
  ] as const).map(([code, source]) => ({ code, source }));
  artifacts.set("tools/verify/artifacts/feature-parity-ui-native/platform-diagnostics.json", json({ entries: diagnosticEntries, runId, schema: "threenative.ui-parity-diagnostics", version: "0.1.0" }));
  for (const { code, source } of diagnosticEntries) artifacts.set(source, `${artifacts.get(source) ?? ""}\n${code}`);
  artifacts.set("tools/verify/artifacts/input-ui-polish/verification-report.json", json({
    artifacts: { contactSheet: "linked/contact.png", diff: "linked/diff.png", nativeReport: "linked/native.json", webReport: "linked/web.json" },
    ok: true,
    parity: { mismatches: [] },
    promotedCapabilities: promotedUiCapabilitiesForFixture("input-ui-polish"),
  }));
  artifacts.set("linked/contact.png", "linked");
  artifacts.set("linked/diff.png", "linked");
  artifacts.set("linked/native.json", "linked");
  artifacts.set("linked/web.json", "linked");
  const viewports: Record<string, unknown> = {};
  const nodeKinds = ["bar", "column", "image", "row", "stack", "text"];
  for (const [name, dimensions] of Object.entries({ desktop: { height: 720, width: 1280 }, mobile: { height: 844, width: 390 } })) {
    const webPath = `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/web.png`;
    const nativePath = `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/native.png`;
    const contactPath = `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/contact-sheet.png`;
    viewports[name] = {
      ...dimensions,
      captures: { native: { path: nativePath, sha256: hash(artifacts.get(nativePath)!) }, web: { path: webPath, sha256: hash(artifacts.get(webPath)!) } },
      contactSheet: { path: contactPath, sha256: hash(artifacts.get(contactPath)!) },
      comparison: { diffPath: `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/diff.png`, differingPixelRatio: 0, meanAbsoluteError: 0, sha256: hash(artifacts.get(`tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/diff.png`)!) },
      nodeKinds,
      regions: {
        native: (behavior("native").regions as Array<Record<string, unknown>>).find((entry) => entry.target === name),
        web: (behavior("web").regions as Array<Record<string, unknown>>).find((entry) => entry.target === name),
      },
    };
  }
  artifacts.set("tools/verify/artifacts/feature-parity-ui-native/viewport-report.json", json({ ok: true, runId, schema: "threenative.ui-parity-viewports", version: "0.1.0", viewports }));
  return { artifacts, report: makeReport(artifacts) };
}

function makeReport(artifacts: ReadonlyMap<string, string | Uint8Array>): Record<string, unknown> {
  return {
    artifacts: requiredUiParityArtifacts(),
    capabilityScope: { dpi: "unsupported-diagnostic", ime: "platform-diagnostic", nativeStyles: "trace-only", screenReader: "accessibility-metadata-only", virtualKeyboard: "platform-diagnostic", worldUi: "projection-trace-only" },
    evidenceManifest: {
      entries: requiredUiParityArtifacts().map((path) => {
        const content = artifacts.get(path)!;
        return { byteSize: bytes(content).length, coveredRows: uiParityRowsForArtifact(path), path, runId, sha256: hash(content) };
      }),
      runId,
    },
    ok: true,
    registry: { rows: UI_PARITY_ROWS.map((row) => ({ claim: row.claim, id: row.id, requiredTier: row.requiredTier })) },
    runId,
  };
}

function behavior(adapter: "native" | "web"): Record<string, unknown> {
  const widgets = [
    { id: "advanced.ui", kind: "column", height: 620, width: 420 },
    { id: "quest.frame", kind: "image", height: 64, width: 160 },
    { id: "parity.row", kind: "row", height: 48, width: 260 },
    { id: "parity.stack", kind: "stack", height: 44, width: 120 },
    { id: "invalid.input", kind: "text" },
    { id: "critical.health", kind: "bar" },
  ];
  return {
    actions: [
      { action: "InspectItem", node: "selected.item" },
      { action: "SetVolume", node: "audio.volume", value: 0.75 },
      { action: "SetPlayerName", node: "player.name", value: "Nora" },
      { action: "Jump", node: "mobile.jump" },
    ],
    adapter,
    diagnostics: [],
    focus: { events: [{ focus: "audio.volume", input: "right", kind: "focus" }], focusOrder: ["player.name", "audio.volume", "selected.item", "focused.confirm", "mobile.jump"] },
    ok: true,
    regions: [
      { root: { height: 620, id: "advanced.ui", width: 420 }, target: "desktop", widgets },
      { root: { height: 700, id: "advanced.ui", width: 340 }, target: "mobile", widgets },
    ],
    responsive: [{ rootHeight: 620, rootWidth: 420, target: "desktop" }, { rootHeight: 700, rootWidth: 340, target: "mobile" }],
    runId,
    schema: "threenative.ui-parity-behavior",
    state: { disabledActivation: "disabled", disabledUpdate: true, textValue: "Nora", valueUpdate: 0.6 },
    textEdit: { frames: [{ caret: 4, operation: "initial", value: "Nova" }, { caret: 3, operation: "move", value: "Nova" }, { caret: 4, operation: "insert", value: "Norva" }, { caret: 3, operation: "backspace", value: "Nova" }] },
    version: "0.1.0",
  };
}

function accessibility(adapter: "native" | "web"): Record<string, unknown> {
  const nodes = [
    { disabled: false, focusable: false, focused: false, id: "advanced.ui", name: "Mission interface", relationships: { children: ["player.name", "quest.frame", "audio.volume", "selected.item", "quest.target", "invalid.input", "critical.health", "focused.confirm", "parity.row", "enemy.nameplate", "pickup.label"] } },
    { disabled: false, focusable: true, focused: true, id: "player.name", name: "Player name", relationships: { children: [] }, role: "textbox", value: "Nora" },
    { disabled: false, focusable: true, focused: false, id: "audio.volume", name: "Volume", relationships: { children: [], left: "player.name", right: "selected.item" }, role: "slider", value: "0.6" },
    { disabled: true, focusable: false, focused: false, id: "selected.item", name: "Crystal Key", relationships: { children: [], left: "audio.volume", right: "focused.confirm" }, role: "button" },
    { disabled: false, focusable: false, focused: false, id: "critical.health", name: "Critical health", relationships: { children: [] }, role: "progressbar", value: "2" },
    { disabled: false, focusable: true, focused: false, id: "focused.confirm", name: "Confirm", relationships: { children: [] }, role: "button" },
    { disabled: false, focusable: true, focused: false, id: "mobile.jump", name: "Jump", relationships: { children: [] }, role: "button" },
  ].sort((left, right) => left.id.localeCompare(right.id));
  return {
    adapter,
    nodes,
    runId,
    schema: "threenative.ui-accessibility-snapshot",
    version: "0.1.0",
  };
}

function png(width: number, height: number, varied: boolean): Buffer {
  const frame = new PNG({ height, width });
  for (let index = 0; index < frame.data.length; index += 4) {
    const value = varied ? (index / 4) % 251 : 20;
    frame.data[index] = value;
    frame.data[index + 1] = varied ? (value * 3) % 255 : value;
    frame.data[index + 2] = varied ? (value * 7) % 255 : value;
    frame.data[index + 3] = 255;
  }
  return PNG.sync.write(frame);
}

function contact(webBytes: string | Uint8Array, nativeBytes: string | Uint8Array): Buffer {
  const web = PNG.sync.read(bytes(webBytes));
  const native = PNG.sync.read(bytes(nativeBytes));
  const frame = new PNG({ height: web.height, width: web.width * 2 });
  PNG.bitblt(web, frame, 0, 0, web.width, web.height, 0, 0);
  PNG.bitblt(native, frame, 0, 0, native.width, native.height, web.width, 0);
  return PNG.sync.write(frame);
}

function diff(webBytes: string | Uint8Array, nativeBytes: string | Uint8Array): Buffer {
  const web = PNG.sync.read(bytes(webBytes));
  const native = PNG.sync.read(bytes(nativeBytes));
  const frame = new PNG({ height: web.height, width: web.width });
  for (let index = 0; index < frame.data.length; index += 4) {
    const value = Math.min(255, Math.max(Math.abs(web.data[index]! - native.data[index]!), Math.abs(web.data[index + 1]! - native.data[index + 1]!), Math.abs(web.data[index + 2]! - native.data[index + 2]!)) * 3);
    frame.data[index] = value;
    frame.data[index + 1] = value;
    frame.data[index + 2] = value;
    frame.data[index + 3] = 255;
  }
  return PNG.sync.write(frame);
}

function json(value: unknown): string { return `${JSON.stringify(value)}\n`; }
function bytes(value: string | Uint8Array): Buffer { return typeof value === "string" ? Buffer.from(value) : Buffer.from(value); }
function hash(value: string | Uint8Array): string { return createHash("sha256").update(bytes(value)).digest("hex"); }
async function validate(fixture: { artifacts: Map<string, string | Uint8Array>; report: Record<string, unknown> }) {
  return validateUiNativeReport(fixture.report, async (path) => { if (!fixture.artifacts.has(path)) throw new Error("missing"); }, async (path) => fixture.artifacts.get(path)!);
}
