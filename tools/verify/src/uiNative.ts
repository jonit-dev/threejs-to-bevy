import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "pngjs";

import type { VerificationDiagnostic } from "./runner.js";
import {
  UI_PARITY_ROWS,
  promotedUiCapabilitiesForFixture,
  requiredUiParityArtifacts,
  uiParityRowsForArtifact,
  validateUiParityRegistry,
  type UiEvidenceKind,
} from "./uiParityRegistry.js";

export interface UiNativeGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

type ReadArtifact = (path: string) => Promise<string | Uint8Array>;

const VIEWPORTS = {
  desktop: { height: 720, width: 1280 },
  mobile: { height: 844, width: 390 },
} as const;
const EXPECTED_ACCESSIBILITY = new Map([
  ["player.name", "textbox"],
  ["audio.volume", "slider"],
  ["selected.item", "button"],
  ["critical.health", "progressbar"],
  ["focused.confirm", "button"],
  ["mobile.jump", "button"],
]);

export async function validateUiNativeReport(
  report: unknown,
  accessFile: (path: string) => Promise<void> = access,
  readArtifact: ReadArtifact = readFile,
): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = validateUiParityRegistry().map((entry) => diagnostic(entry.code, entry.message, entry.path));
  if (!isRecord(report) || report.ok !== true || typeof report.runId !== "string" || report.runId.length < 8 || !Array.isArray(report.artifacts)) {
    return [...diagnostics, diagnostic("TN_VERIFY_UI_NATIVE_REPORT_INVALID", "UI native report must be a passing, run-bound artifact report.", "verification-report.json")];
  }
  const expectedArtifacts = requiredUiParityArtifacts();
  if (JSON.stringify([...report.artifacts].sort()) !== JSON.stringify(expectedArtifacts)) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_ARTIFACT_SET_DRIFT", "UI native report artifacts must exactly match the registry-derived artifact set.", "artifacts"));
  const registry = isRecord(report.registry) ? report.registry : {};
  const actualRows = Array.isArray(registry.rows) ? registry.rows : [];
  const expectedRows = UI_PARITY_ROWS.map((row) => ({ claim: row.claim, id: row.id, requiredTier: row.requiredTier }));
  if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows)) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_REGISTRY_DRIFT", "UI native report registry rows do not match the owning UI parity registry.", "registry/rows"));

  const manifest = isRecord(report.evidenceManifest) ? report.evidenceManifest : {};
  const entries = Array.isArray(manifest.entries) ? manifest.entries.filter(isRecord) : [];
  if (manifest.runId !== report.runId || entries.length !== expectedArtifacts.length) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_MANIFEST_INVALID", "Evidence manifest must bind every required artifact to the current run.", "evidenceManifest"));
  const entryByPath = new Map(entries.flatMap((entry) => typeof entry.path === "string" ? [[entry.path, entry] as const] : []));
  if (entryByPath.size !== expectedArtifacts.length) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_MANIFEST_INVALID", "Evidence manifest paths must be unique and complete.", "evidenceManifest/entries"));

  const evidenceKinds = new Map<string, UiEvidenceKind>();
  for (const row of UI_PARITY_ROWS.filter((entry) => entry.claim === "promoted")) {
    for (const evidence of row.evidence) if (evidence.artifact !== undefined) evidenceKinds.set(evidence.artifact, evidence.kind);
  }
  const contents = new Map<string, string | Uint8Array>();
  for (const path of expectedArtifacts) {
    let content: string | Uint8Array;
    try {
      await accessFile(path);
      content = await readArtifact(path);
      contents.set(path, content);
    } catch {
      diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_ARTIFACT_MISSING", `Required UI parity artifact does not exist: ${path}.`, path));
      continue;
    }
    const bytes = toBuffer(content);
    const entry = entryByPath.get(path);
    const expectedRowsForPath = uiParityRowsForArtifact(path);
    if (entry === undefined
      || entry.runId !== report.runId
      || entry.byteSize !== bytes.length
      || entry.sha256 !== sha256(bytes)
      || JSON.stringify(entry.coveredRows) !== JSON.stringify(expectedRowsForPath)) {
      diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_MANIFEST_ENTRY_INVALID", "Artifact hash, size, run identity, or registry-row coverage does not match its manifest entry.", path));
    }
    diagnostics.push(...validateArtifactContent(path, evidenceKinds.get(path), content, report.runId));
  }
  diagnostics.push(...validateViewportBindings(contents));
  diagnostics.push(...await validateLinkedInputReport(contents, accessFile, readArtifact));
  diagnostics.push(...await validatePlatformDiagnostics(contents, readArtifact, report.runId));

  const scope = isRecord(report.capabilityScope) ? report.capabilityScope : {};
  if (scope.dpi !== "unsupported-diagnostic" || scope.ime !== "platform-diagnostic" || scope.virtualKeyboard !== "platform-diagnostic") diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_CAPABILITY_SCOPE_INVALID", "DPI scaling, IME, and virtual keyboard claims must remain target-scoped diagnostics.", "capabilityScope"));
  if (scope.screenReader !== "accessibility-metadata-only" || scope.worldUi !== "projection-trace-only" || scope.nativeStyles !== "trace-only") diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_CAPABILITY_SCOPE_INVALID", "Screen-reader, world UI, and native style claims must remain metadata/trace-only.", "capabilityScope"));

  const webBehavior = parseRecord(contents.get("tools/verify/artifacts/feature-parity-ui-native/behavior/web.json"));
  const nativeBehavior = parseRecord(contents.get("tools/verify/artifacts/feature-parity-ui-native/behavior/native.json"));
  if (webBehavior !== undefined && nativeBehavior !== undefined && JSON.stringify(normalizeAdapterReport(webBehavior)) !== JSON.stringify(normalizeAdapterReport(nativeBehavior))) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_BEHAVIOR_MISMATCH", "Web and native UI behavior reports differ.", "behavior"));
  const webAccessibility = parseRecord(contents.get("tools/verify/artifacts/feature-parity-ui-native/accessibility/web.json"));
  const nativeAccessibility = parseRecord(contents.get("tools/verify/artifacts/feature-parity-ui-native/accessibility/native.json"));
  if (webAccessibility !== undefined && nativeAccessibility !== undefined && JSON.stringify(normalizeAdapterReport(webAccessibility)) !== JSON.stringify(normalizeAdapterReport(nativeAccessibility))) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_ACCESSIBILITY_MISMATCH", "Web and native normalized accessibility snapshots differ.", "accessibility"));
  return diagnostics;
}

export async function runUiNativeGate(options: { reportPath?: string; root?: string } = {}): Promise<UiNativeGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/feature-parity-ui-native/verification-report.json");
  let report: unknown;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
  } catch {
    report = undefined;
  }
  const diagnostics = await validateUiNativeReport(report, (path) => access(resolve(root, path)), (path) => readFile(resolve(root, path)));
  return { diagnostics, ok: diagnostics.length === 0, reportPath };
}

function validateArtifactContent(path: string, evidenceKind: UiEvidenceKind | undefined, content: string | Uint8Array, runId: string): VerificationDiagnostic[] {
  if (path.endsWith(".png")) return validatePng(path, content);
  const value = parseRecord(content);
  if (value === undefined) return [diagnostic("TN_VERIFY_UI_NATIVE_ARTIFACT_INVALID", "UI parity JSON artifact could not be parsed as an object.", path)];
  if (evidenceKind === "behavior-report") return validateBehavior(value, path, runId);
  if (evidenceKind === "accessibility-snapshot") return validateAccessibility(value, path, runId);
  if (path.endsWith("viewport-report.json") && (value.schema !== "threenative.ui-parity-viewports" || value.ok !== true || value.runId !== runId || !isRecord(value.viewports) || !isRecord(value.viewports.desktop) || !isRecord(value.viewports.mobile))) return [diagnostic("TN_VERIFY_UI_NATIVE_VIEWPORT_REPORT_INVALID", "Viewport evidence must report current-run desktop and mobile captures.", path)];
  if (path.endsWith("input-ui-polish/verification-report.json") && value.ok !== true) return [diagnostic("TN_VERIFY_UI_NATIVE_LINKED_GATE_FAILED", "Linked input/UI polish evidence must pass.", path)];
  if (path.endsWith("feature-parity-ui-native/native-trace.json")) {
    const attachments = isRecord(value.attachments) && Array.isArray(value.attachments.projections) ? value.attachments.projections.filter(isRecord) : [];
    const effects = isRecord(value.visualEffects) && Array.isArray(value.visualEffects.effects) ? value.visualEffects.effects.filter(isRecord) : [];
    const worldObserved = attachments.some((entry) => entry.node === "enemy.nameplate");
    const styleObserved = effects.some((entry) => entry.node === "advanced.ui" && isRecord(entry.gradient) && isRecord(entry.shadow));
    if (value.schema !== "threenative.ui-native-trace" || !worldObserved || !styleObserved) return [diagnostic("TN_VERIFY_UI_NATIVE_TRACE_INVALID", "Native trace must retain exact world-attachment and gradient/shadow partial observations.", path)];
  }
  return [];
}

function validatePng(path: string, content: string | Uint8Array): VerificationDiagnostic[] {
  let frame: PNG;
  try {
    frame = PNG.sync.read(toBuffer(content));
  } catch {
    return [diagnostic("TN_VERIFY_UI_NATIVE_SCREENSHOT_INVALID", "UI rendered evidence must be a decodable PNG.", path)];
  }
  const viewport = path.includes("/mobile/") ? VIEWPORTS.mobile : VIEWPORTS.desktop;
  const expectedWidth = path.endsWith("contact-sheet.png") ? viewport.width * 2 : viewport.width;
  if (frame.width !== expectedWidth || frame.height !== viewport.height) return [diagnostic("TN_VERIFY_UI_NATIVE_SCREENSHOT_DIMENSIONS_INVALID", `Expected ${expectedWidth}x${viewport.height} UI evidence.`, path)];
  if (path.endsWith("diff.png")) return [];
  const colors = new Set<string>();
  let minLuma = 255;
  let maxLuma = 0;
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    if (colors.size < 32) colors.add(`${red},${green},${blue}`);
    const luma = Math.round((red + green + blue) / 3);
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
  }
  return colors.size >= 4 && maxLuma - minLuma >= 12 ? [] : [diagnostic("TN_VERIFY_UI_NATIVE_SCREENSHOT_EMPTY", "UI rendered evidence must contain non-trivial rendered pixels.", path)];
}

function validateBehavior(value: Record<string, unknown>, path: string, runId: string): VerificationDiagnostic[] {
  const actions = Array.isArray(value.actions) ? value.actions.filter(isRecord) : [];
  const requiredActions = [["selected.item", "InspectItem", undefined], ["audio.volume", "SetVolume", 0.75], ["player.name", "SetPlayerName", "Nora"], ["mobile.jump", "Jump", undefined]] as const;
  const actionOk = requiredActions.every(([node, action, expectedValue]) => actions.some((entry) => entry.node === node && entry.action === action && (expectedValue === undefined || entry.value === expectedValue)));
  const focus = isRecord(value.focus) ? value.focus : {};
  const state = isRecord(value.state) ? value.state : {};
  const textEdit = isRecord(value.textEdit) ? value.textEdit : {};
  const regions = Array.isArray(value.regions) ? value.regions.filter(isRecord) : [];
  const responsive = Array.isArray(value.responsive) ? value.responsive.filter(isRecord) : [];
  const responsiveOk = responsive.some((entry) => entry.target === "desktop" && entry.rootWidth === 420 && entry.rootHeight === 620)
    && responsive.some((entry) => entry.target === "mobile" && entry.rootWidth === 340 && entry.rootHeight === 700);
  const focusOrder = ["player.name", "audio.volume", "selected.item", "focused.confirm", "mobile.jump"];
  const renderedKinds = new Set(UI_PARITY_ROWS.filter((row) => row.claim === "promoted" && row.requiredTier === "rendered").flatMap((row) => row.nodeKinds ?? []));
  const regionsOk = ["desktop", "mobile"].every((target) => {
    const region = regions.find((entry) => entry.target === target);
    const root = isRecord(region?.root) ? region.root : {};
    const widgets = Array.isArray(region?.widgets) ? region.widgets.filter(isRecord) : [];
    const observedKinds = new Set(widgets.flatMap((widget) => typeof widget.kind === "string" ? [widget.kind] : []));
    return root.id === "advanced.ui" && typeof root.width === "number" && typeof root.height === "number" && [...renderedKinds].filter((kind) => kind !== "column").every((kind) => observedKinds.has(kind));
  });
  const valid = value.schema === "threenative.ui-parity-behavior" && value.version === "0.1.0" && value.ok === true && value.runId === runId
    && actionOk && JSON.stringify(focus.focusOrder) === JSON.stringify(focusOrder) && Array.isArray(focus.events) && focus.events.length > 0
    && state.disabledActivation === "disabled" && state.disabledUpdate === true && state.valueUpdate === 0.6 && state.textValue === "Nora"
    && Array.isArray(textEdit.frames) && textEdit.frames.length >= 4 && responsiveOk && regionsOk && (!Array.isArray(value.diagnostics) || value.diagnostics.length === 0);
  return valid ? [] : [diagnostic("TN_VERIFY_UI_NATIVE_BEHAVIOR_INVALID", "Behavior evidence must prove actions, focus, responsive layout, disabled/value mutation, and caret editing for the current run.", path)];
}

function validateAccessibility(value: Record<string, unknown>, path: string, runId: string): VerificationDiagnostic[] {
  const nodes = Array.isArray(value.nodes) ? value.nodes.filter(isRecord) : [];
  const nodeIds = nodes.flatMap((node) => typeof node.id === "string" ? [node.id] : []);
  const ids = new Set(nodeIds);
  const expected = [...EXPECTED_ACCESSIBILITY].every(([id, role]) => nodes.some((node) => node.id === id && node.role === role && typeof node.disabled === "boolean" && typeof node.focusable === "boolean" && typeof node.focused === "boolean" && isRecord(node.relationships) && typeof node.name === "string" && node.name.length > 0));
  const byId = new Map(nodes.flatMap((node) => typeof node.id === "string" ? [[node.id, node] as const] : []));
  const player = byId.get("player.name");
  const slider = byId.get("audio.volume");
  const selected = byId.get("selected.item");
  const health = byId.get("critical.health");
  const root = byId.get("advanced.ui");
  const playerRelationships = isRecord(player?.relationships) ? player.relationships : {};
  const sliderRelationships = isRecord(slider?.relationships) ? slider.relationships : {};
  const selectedRelationships = isRecord(selected?.relationships) ? selected.relationships : {};
  const semanticState = player?.value === "Nora" && player.focused === true && player.focusable === true
    && slider?.value === "0.6" && sliderRelationships.left === "player.name" && sliderRelationships.right === "selected.item"
    && health?.value === "2"
    && selected?.disabled === true && selected.focusable === false && selectedRelationships.left === "audio.volume" && selectedRelationships.right === "focused.confirm"
    && Array.isArray(root?.relationships) === false && isRecord(root?.relationships) && Array.isArray(root.relationships.children) && root.relationships.children.includes("player.name")
    && isRecord(playerRelationships);
  const valid = value.schema === "threenative.ui-accessibility-snapshot" && value.version === "0.1.0" && value.runId === runId
    && expected && semanticState && ids.size === nodes.length && JSON.stringify(nodeIds) === JSON.stringify([...nodeIds].sort()) && nodes.length >= EXPECTED_ACCESSIBILITY.size && (!Array.isArray(value.diagnostics) || value.diagnostics.length === 0);
  return valid ? [] : [diagnostic("TN_VERIFY_UI_NATIVE_ACCESSIBILITY_INVALID", "Accessibility evidence must contain unique, normalized expected widget nodes with no diagnostics for the current run.", path)];
}

function validateViewportBindings(contents: ReadonlyMap<string, string | Uint8Array>): VerificationDiagnostic[] {
  const reportPath = "tools/verify/artifacts/feature-parity-ui-native/viewport-report.json";
  const report = parseRecord(contents.get(reportPath));
  if (report === undefined || !isRecord(report.viewports)) return [];
  const diagnostics: VerificationDiagnostic[] = [];
  const renderedKinds = [...new Set(UI_PARITY_ROWS.filter((row) => row.claim === "promoted" && row.requiredTier === "rendered").flatMap((row) => row.nodeKinds ?? []))].sort();
  const behavior = {
    native: parseRecord(contents.get("tools/verify/artifacts/feature-parity-ui-native/behavior/native.json")),
    web: parseRecord(contents.get("tools/verify/artifacts/feature-parity-ui-native/behavior/web.json")),
  };
  for (const [name, size] of Object.entries(VIEWPORTS)) {
    const viewport = isRecord(report.viewports[name]) ? report.viewports[name] : {};
    if (viewport.width !== size.width || viewport.height !== size.height || JSON.stringify(viewport.nodeKinds) !== JSON.stringify(renderedKinds) || !isRecord(viewport.captures) || !isRecord(viewport.contactSheet) || !isRecord(viewport.regions) || !isRecord(viewport.comparison)) {
      diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_VIEWPORT_COVERAGE_INVALID", `Viewport '${name}' must bind its dimensions, promoted node kinds, captures, and contact sheet.`, `${reportPath}/viewports/${name}`));
      continue;
    }
    for (const adapter of ["web", "native"] as const) {
      const path = `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/${adapter}.png`;
      const capture = isRecord(viewport.captures[adapter]) ? viewport.captures[adapter] : {};
      const bytes = contents.get(path);
      if (capture.path !== path || bytes === undefined || capture.sha256 !== sha256(toBuffer(bytes))) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_VIEWPORT_BINDING_INVALID", "Viewport capture hash does not bind the reported artifact.", path));
      const regions = Array.isArray(behavior[adapter]?.regions) ? behavior[adapter]!.regions as unknown[] : [];
      const expectedRegion = regions.find((entry) => isRecord(entry) && entry.target === name);
      if (JSON.stringify(viewport.regions[adapter]) !== JSON.stringify(expectedRegion)) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_VIEWPORT_REGION_INVALID", "Viewport regions must be observed by and match the adapter behavior report.", `${reportPath}/viewports/${name}/regions/${adapter}`));
    }
    const contactPath = `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/contact-sheet.png`;
    const contactBytes = contents.get(contactPath);
    if (viewport.contactSheet.path !== contactPath || contactBytes === undefined || viewport.contactSheet.sha256 !== sha256(toBuffer(contactBytes))) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_VIEWPORT_BINDING_INVALID", "Contact sheet hash does not bind the paired captures.", contactPath));
    const diffPath = `tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/diff.png`;
    const diffBytes = contents.get(diffPath);
    const webBytes = contents.get(`tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/web.png`);
    const nativeBytes = contents.get(`tools/verify/artifacts/feature-parity-ui-native/viewports/${name}/native.png`);
    if (viewport.comparison.diffPath !== diffPath || diffBytes === undefined || viewport.comparison.sha256 !== sha256(toBuffer(diffBytes)) || webBytes === undefined || nativeBytes === undefined || contactBytes === undefined) {
      diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_VISUAL_COMPARISON_INVALID", "Viewport comparison must bind the current paired captures and retained diff.", diffPath));
    } else {
      const metrics = comparePngs(webBytes, nativeBytes);
      if (viewport.comparison.meanAbsoluteError !== metrics.meanAbsoluteError || viewport.comparison.differingPixelRatio !== metrics.differingPixelRatio) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_VISUAL_COMPARISON_INVALID", "Viewport comparison metrics do not match the paired captures.", diffPath));
      if (!diffMatches(diffBytes, webBytes, nativeBytes)) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_DIFF_INVALID", "Retained diff pixels must be the exact amplified web/native per-pixel difference.", diffPath));
      if (!contactMatches(contactBytes, webBytes, nativeBytes)) diagnostics.push(diagnostic("TN_VERIFY_UI_NATIVE_CONTACT_SHEET_INVALID", "Contact sheet pixels must be the exact current web/native capture pair.", contactPath));
    }
  }
  return diagnostics;
}

function comparePngs(leftBytes: string | Uint8Array, rightBytes: string | Uint8Array): { differingPixelRatio: number; meanAbsoluteError: number } {
  const left = PNG.sync.read(toBuffer(leftBytes));
  const right = PNG.sync.read(toBuffer(rightBytes));
  let absolute = 0;
  let differing = 0;
  const pixels = left.width * left.height;
  for (let index = 0; index < left.data.length; index += 4) {
    const delta = Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)) + Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0)) + Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0));
    absolute += delta;
    if (delta > 0) differing += 1;
  }
  return { differingPixelRatio: round(differing / pixels), meanAbsoluteError: round(absolute / (pixels * 3 * 255)) };
}

function contactMatches(contactBytes: string | Uint8Array, webBytes: string | Uint8Array, nativeBytes: string | Uint8Array): boolean {
  const contact = PNG.sync.read(toBuffer(contactBytes));
  const web = PNG.sync.read(toBuffer(webBytes));
  const native = PNG.sync.read(toBuffer(nativeBytes));
  for (let y = 0; y < web.height; y += 1) for (let x = 0; x < web.width; x += 1) {
    const source = (y * web.width + x) * 4;
    const webTarget = (y * contact.width + x) * 4;
    const nativeTarget = (y * contact.width + web.width + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) if (contact.data[webTarget + channel] !== web.data[source + channel] || contact.data[nativeTarget + channel] !== native.data[source + channel]) return false;
  }
  return true;
}

function diffMatches(diffBytes: string | Uint8Array, webBytes: string | Uint8Array, nativeBytes: string | Uint8Array): boolean {
  const diff = PNG.sync.read(toBuffer(diffBytes));
  const web = PNG.sync.read(toBuffer(webBytes));
  const native = PNG.sync.read(toBuffer(nativeBytes));
  if (diff.width !== web.width || diff.height !== web.height || native.width !== web.width || native.height !== web.height) return false;
  for (let index = 0; index < diff.data.length; index += 4) {
    const maxDelta = Math.max(
      Math.abs((web.data[index] ?? 0) - (native.data[index] ?? 0)),
      Math.abs((web.data[index + 1] ?? 0) - (native.data[index + 1] ?? 0)),
      Math.abs((web.data[index + 2] ?? 0) - (native.data[index + 2] ?? 0)),
    );
    const expected = Math.min(255, maxDelta * 3);
    if (diff.data[index] !== expected || diff.data[index + 1] !== expected || diff.data[index + 2] !== expected || diff.data[index + 3] !== 255) return false;
  }
  return true;
}

function round(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }

async function validateLinkedInputReport(contents: ReadonlyMap<string, string | Uint8Array>, accessFile: (path: string) => Promise<void>, readArtifact: ReadArtifact): Promise<VerificationDiagnostic[]> {
  const path = "tools/verify/artifacts/input-ui-polish/verification-report.json";
  const report = parseRecord(contents.get(path));
  if (report === undefined) return [];
  const expectedCapabilities = promotedUiCapabilitiesForFixture("input-ui-polish");
  const artifacts = isRecord(report.artifacts) ? report.artifacts : {};
  const linkedPaths = [artifacts.webReport, artifacts.nativeReport, artifacts.diff, artifacts.contactSheet].filter((entry): entry is string => typeof entry === "string");
  const parity = isRecord(report.parity) ? report.parity : {};
  const valid = report.ok === true && JSON.stringify(report.promotedCapabilities) === JSON.stringify(expectedCapabilities) && linkedPaths.length === 4 && Array.isArray(parity.mismatches) && parity.mismatches.length === 0;
  if (!valid) return [diagnostic("TN_VERIFY_UI_NATIVE_LINKED_GATE_INVALID", "Linked input/UI polish report must prove registry-derived capabilities and paired artifact parity.", path)];
  for (const linkedPath of linkedPaths) {
    try {
      await accessFile(linkedPath);
      const value = await readArtifact(linkedPath);
      if (toBuffer(value).length === 0) throw new Error("empty");
    } catch {
      return [diagnostic("TN_VERIFY_UI_NATIVE_LINKED_ARTIFACT_MISSING", "Linked input/UI polish artifact is missing or empty.", linkedPath)];
    }
  }
  return [];
}

async function validatePlatformDiagnostics(contents: ReadonlyMap<string, string | Uint8Array>, readArtifact: ReadArtifact, runId: string): Promise<VerificationDiagnostic[]> {
  const path = "tools/verify/artifacts/feature-parity-ui-native/platform-diagnostics.json";
  const report = parseRecord(contents.get(path));
  const entries = report !== undefined && Array.isArray(report.entries) ? report.entries.filter(isRecord) : [];
  const expectedCodes = [...new Set(UI_PARITY_ROWS.flatMap((row) => row.diagnosticCodes ?? []))].sort();
  const actualCodes = entries.flatMap((entry) => typeof entry.code === "string" ? [entry.code] : []).sort();
  if (report?.schema !== "threenative.ui-parity-diagnostics" || report.runId !== runId || JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes)) return [diagnostic("TN_VERIFY_UI_NATIVE_DIAGNOSTICS_INVALID", "Platform diagnostics evidence must exactly cover the registry-retained diagnostic codes for the current run.", path)];
  for (const entry of entries) {
    if (typeof entry.code !== "string" || typeof entry.source !== "string") return [diagnostic("TN_VERIFY_UI_NATIVE_DIAGNOSTICS_INVALID", "Every retained diagnostic must name its owning source.", path)];
    try {
      const source = await readArtifact(entry.source);
      if (!toBuffer(source).includes(Buffer.from(entry.code))) throw new Error("missing code");
    } catch {
      return [diagnostic("TN_VERIFY_UI_NATIVE_DIAGNOSTIC_SOURCE_MISSING", `Diagnostic '${entry.code}' is not present in its declared owning source.`, entry.source)];
    }
  }
  return [];
}

function parseRecord(content: string | Uint8Array | undefined): Record<string, unknown> | undefined {
  if (content === undefined) return undefined;
  try {
    const value = JSON.parse(typeof content === "string" ? content : Buffer.from(content).toString("utf8")) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAdapterReport(value: Record<string, unknown>): unknown {
  return sortKeys(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "adapter" && key !== "diagnostics")));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortKeys(child)]));
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toBuffer(content: string | Uint8Array): Buffer {
  return typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic {
  return { code, message, path, severity: "error", suggestedFix: "Regenerate the registry-derived UI parity evidence and inspect the referenced artifact." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runUiNativeGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
