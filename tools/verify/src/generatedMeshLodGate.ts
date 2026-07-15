import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import { loadFixtureCatalog, type FixtureCatalog, type FixtureCatalogEntry } from "./conformance.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);
const GATE_NAME = "verify:generated-mesh-lod";
const FIXTURE_ID = "procedural-mesh-lod";
const STATES = ["near", "threshold-1", "threshold-2", "far"] as const;
const THRESHOLDS = {
  maxColorMae: 0.05,
  maxDistanceDelta: 0.02,
  maxSilhouetteDelta: 0.05,
  minNonBackgroundFraction: 0.001,
} as const;

type LodState = typeof STATES[number];

export interface MeshLodTraceSelection {
  distance: number | null;
  entity: string;
  selectedMesh: string;
  threshold: number;
}

export interface GeneratedMeshLodStateEvidence {
  nativeBytes: number;
  nativeMetrics: MeshLodScreenshotMetrics;
  nativeSelection: MeshLodTraceSelection;
  state: LodState;
  webBytes: number;
  webMetrics: MeshLodScreenshotMetrics;
  webSelection: MeshLodTraceSelection;
}

export interface MeshLodScreenshotMetrics {
  colorMae: number;
  nativeNonBackgroundFraction: number;
  silhouetteDelta: number;
  webNonBackgroundFraction: number;
}

export interface GeneratedMeshLodContract {
  baseMesh: string;
  cameraEntity: string;
  entity: string;
  invariant: Record<string, unknown>;
  levels: Array<{ mesh: string; minDistance: number }>;
  payloads: Array<{ bytes: number; id: string; sha256: string; triangleCount: number }>;
  payloadSizes: { baseBytes: number; totalBytes: number };
  triangleCounts: Record<string, number>;
}

export interface GeneratedMeshLodRuntimeInvariants {
  native: RuntimeInvariantObservation;
  web: RuntimeInvariantObservation;
}

export interface RuntimeInvariantObservation {
  collider: boolean;
  hierarchy: string | null;
  layers: boolean;
  material: string | null;
  shadows: { cast: boolean; receive: boolean };
  transform: unknown;
  visibility: boolean;
}

export function resolveGeneratedMeshLodFixture(catalog: FixtureCatalog): FixtureCatalogEntry {
  const matches = catalog.fixtures.filter((entry) => entry.canonicalId === FIXTURE_ID && entry.aggregateGate === GATE_NAME);
  if (matches.length !== 1) {
    throw new Error(`Fixture catalog must enroll '${FIXTURE_ID}' in '${GATE_NAME}' exactly once; found ${matches.length}.`);
  }
  return matches[0]!;
}

export function validateGeneratedMeshLodEvidence(
  contract: GeneratedMeshLodContract,
  states: readonly GeneratedMeshLodStateEvidence[],
  runtimeInvariants?: GeneratedMeshLodRuntimeInvariants,
): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (contract.levels.length !== 2) {
    diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_LEVELS_INVALID", "The focused fixture must have exactly two generated LOD levels.", "world.ir.json"));
    return diagnostics;
  }
  const ids = [contract.baseMesh, ...contract.levels.map((level) => level.mesh)];
  const counts = ids.map((id) => contract.triangleCounts[id]);
  if (counts.some((count) => !Number.isInteger(count) || count! <= 0) || !(counts[0]! > counts[1]! && counts[1]! > counts[2]!)) {
    diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_TRIANGLE_ORDER_INVALID", "Generated mesh triangle counts must satisfy base > lod1 > lod2.", "assets.manifest.json"));
  }
  if (contract.levels[0]!.minDistance <= 0 || contract.levels[1]!.minDistance <= contract.levels[0]!.minDistance) {
    diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_THRESHOLDS_INVALID", "LOD thresholds must be positive and strictly increasing.", "world.ir.json"));
  }
  if (runtimeInvariants === undefined) {
    diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_RUNTIME_INVARIANTS_MISSING", "Web and native runtime invariant observations are required.", "reports"));
  } else {
    const expected = expectedRuntimeInvariant(contract.invariant);
    for (const [runtime, observation] of [["web", runtimeInvariants.web], ["native", runtimeInvariants.native]] as const) {
      if (JSON.stringify(observation) !== JSON.stringify(expected)) diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_RUNTIME_INVARIANT_DRIFT", `${runtime} transform/material/hierarchy/layers/visibility/shadows/collider observations must match the shared LOD entity contract.`, `reports/${runtime}.report.json`));
    }
  }
  const stateMap = new Map(states.map((state) => [state.state, state]));
  for (const stateName of STATES) {
    const state = stateMap.get(stateName);
    if (state === undefined) {
      diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_STATE_MISSING", `Missing paired '${stateName}' capture and trace evidence.`, stateName));
      continue;
    }
    const levelIndex = stateName === "near" ? 0 : stateName === "threshold-1" ? 1 : 2;
    const expectedMesh = ids[levelIndex]!;
    const expectedThreshold = levelIndex === 0 ? 0 : contract.levels[levelIndex - 1]!.minDistance;
    for (const [runtime, selection] of [["web", state.webSelection], ["native", state.nativeSelection]] as const) {
      if (selection.entity !== contract.entity || selection.selectedMesh !== expectedMesh || selection.threshold !== expectedThreshold) {
        diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_SELECTION_INVALID", `${runtime} '${stateName}' must select '${expectedMesh}' at threshold ${expectedThreshold}.`, `${stateName}.${runtime}.trace.json`));
      }
      if (!distanceMatchesState(stateName, selection.distance, contract.levels)) {
        diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_DISTANCE_INVALID", `${runtime} '${stateName}' reported an invalid selection distance '${selection.distance ?? "null"}'.`, `${stateName}.${runtime}.trace.json`));
      }
      if (stateName.startsWith("threshold-") && selection.distance !== null
        && Math.abs(selection.distance - expectedThreshold) > 0.0001) {
        diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_THRESHOLD_DISTANCE_INVALID", `${runtime} '${stateName}' distance must equal authored threshold ${expectedThreshold} within 0.0001.`, `${stateName}.${runtime}.trace.json`));
      }
    }
    if (state.webSelection.distance !== null && state.nativeSelection.distance !== null
      && Math.abs(state.webSelection.distance - state.nativeSelection.distance) > THRESHOLDS.maxDistanceDelta) {
      diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_DISTANCE_PARITY_INVALID", `Web/native '${stateName}' distances differ by more than ${THRESHOLDS.maxDistanceDelta}.`, `${stateName}.trace.json`));
    }
    if (state.webBytes <= 0 || state.nativeBytes <= 0
      || state.webMetrics.webNonBackgroundFraction < THRESHOLDS.minNonBackgroundFraction
      || state.nativeMetrics.nativeNonBackgroundFraction < THRESHOLDS.minNonBackgroundFraction) {
      diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_SCREENSHOT_BLANK", `Paired '${stateName}' screenshots must be nonblank.`, `${stateName}.png`));
    }
    if (state.webMetrics.silhouetteDelta > THRESHOLDS.maxSilhouetteDelta) {
      diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_SILHOUETTE_DRIFT", `'${stateName}' web/native silhouette delta ${state.webMetrics.silhouetteDelta.toFixed(5)} exceeds ${THRESHOLDS.maxSilhouetteDelta}.`, `${stateName}.png`));
    }
    if (state.webMetrics.colorMae > THRESHOLDS.maxColorMae) {
      diagnostics.push(diagnostic("TN_VERIFY_GENERATED_MESH_LOD_COLOR_DRIFT", `'${stateName}' web/native color MAE ${state.webMetrics.colorMae.toFixed(5)} exceeds ${THRESHOLDS.maxColorMae}.`, `${stateName}.png`));
    }
  }
  return diagnostics;
}

export async function runGeneratedMeshLodGate(options: { reportPath?: string; root?: string } = {}): Promise<{ diagnostics: VerificationDiagnostic[]; ok: boolean; reportPath: string }> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "generated-mesh-lod", owner: { kind: "aggregate" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const artifactDir = resolve(reportPath, "..");
  const screenshotsDir = resolve(artifactDir, "screenshots");
  const tracesDir = resolve(artifactDir, "traces");
  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(tracesDir, { recursive: true });
  const fixture = resolveGeneratedMeshLodFixture(await loadFixtureCatalog(root));
  const bundlePath = resolve(root, fixture.bundlePath);
  const contract = await readContract(bundlePath);
  const reports = await writeRuntimeInvariantReports(root, bundlePath, fixture.canonicalId, artifactDir, contract);
  const bookmarkByState = await readBookmarks(bundlePath);
  const web = await captureWebStates(root, bundlePath, screenshotsDir, tracesDir, bookmarkByState, contract.entity, contract.cameraEntity);
  const states: GeneratedMeshLodStateEvidence[] = [];
  for (const state of STATES) {
    const nativePath = resolve(screenshotsDir, `${state}.native.png`);
    const nativeTracePath = resolve(tracesDir, `${state}.native.trace.json`);
    await captureNativeState(root, bundlePath, bookmarkByState[state].id, nativePath, nativeTracePath);
    const nativeSelection = selectionFromTrace(JSON.parse(await readFile(nativeTracePath, "utf8")), contract.entity);
    const webPath = web[state].screenshotPath;
    const metrics = await analyzePair(webPath, nativePath);
    states.push({
      nativeBytes: (await stat(nativePath)).size,
      nativeMetrics: metrics,
      nativeSelection,
      state,
      webBytes: (await stat(webPath)).size,
      webMetrics: metrics,
      webSelection: web[state].selection,
    });
  }
  const diagnostics = validateGeneratedMeshLodEvidence(contract, states, reports.invariants);
  const contactSheetPath = resolve(artifactDir, "contact-sheet.svg");
  await writeFile(contactSheetPath, renderContactSheet(states), "utf8");
  const ok = diagnostics.every((entry) => entry.severity !== "error");
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: { ...targets.metadata, contactSheetPath: toRepoRelative(root, contactSheetPath) },
    code: ok ? "TN_VERIFY_GENERATED_MESH_LOD_OK" : "TN_VERIFY_GENERATED_MESH_LOD_FAILED",
    contract,
    diagnostics,
    fixtureId: fixture.canonicalId,
    generatedBy: "@threenative/verify-tools generatedMeshLodGate",
    ok,
    schema: "threenative.verify.generated-mesh-lod",
    runtimeInvariants: reports.invariants,
    states: states.map((state) => ({ ...state, artifacts: {
      nativeScreenshotPath: `tools/verify/artifacts/generated-mesh-lod/screenshots/${state.state}.native.png`,
      nativeTracePath: `tools/verify/artifacts/generated-mesh-lod/traces/${state.state}.native.trace.json`,
      webScreenshotPath: `tools/verify/artifacts/generated-mesh-lod/screenshots/${state.state}.web.png`,
      webTracePath: `tools/verify/artifacts/generated-mesh-lod/traces/${state.state}.web.trace.json`,
    } })),
    status: ok ? "pass" : "fail",
    thresholds: { ...THRESHOLDS, source: "2026-07-14 procedural-mesh-lod simple-lit web/native measured envelope" },
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

async function readContract(bundlePath: string): Promise<GeneratedMeshLodContract> {
  const world = JSON.parse(await readFile(resolve(bundlePath, "world.ir.json"), "utf8")) as unknown;
  const assets = JSON.parse(await readFile(resolve(bundlePath, "assets.manifest.json"), "utf8")) as unknown;
  if (!isRecord(world) || !Array.isArray(world.entities) || !isRecord(assets) || !Array.isArray(assets.assets)) throw new Error("Generated mesh LOD fixture bundle is malformed.");
  const owners = world.entities.filter((entity) => isRecord(entity) && isRecord(entity.components) && isRecord(entity.components.MeshRenderer) && isRecord(entity.components.MeshRenderer.lod));
  if (owners.length !== 1) throw new Error(`Generated mesh LOD fixture must have exactly one LOD-owning entity; found ${owners.length}.`);
  const owner = owners[0]!;
  const components = owner.components as Record<string, unknown>;
  const renderer = components.MeshRenderer as Record<string, unknown>;
  const lod = renderer.lod as Record<string, unknown>;
  if (typeof owner.id !== "string" || typeof renderer.mesh !== "string" || !Array.isArray(lod.levels)) throw new Error("Generated mesh LOD owner is malformed.");
  const levels = lod.levels.map((value: unknown) => {
    if (!isRecord(value) || typeof value.mesh !== "string" || typeof value.minDistance !== "number") throw new Error("Generated mesh LOD level is malformed.");
    return { mesh: value.mesh, minDistance: value.minDistance };
  });
  const triangleCounts: Record<string, number> = {};
  for (const asset of assets.assets) if (isRecord(asset) && typeof asset.id === "string" && isRecord(asset.binaryIndices) && typeof asset.binaryIndices.count === "number") triangleCounts[asset.id] = asset.binaryIndices.count / 3;
  const ids = [renderer.mesh, ...levels.map((level) => level.mesh)];
  const payloads = await Promise.all(ids.map(async (id) => {
    const asset = assets.assets.find((candidate: unknown) => isRecord(candidate) && candidate.id === id);
    if (!isRecord(asset)) throw new Error(`Generated mesh LOD asset '${id}' is missing.`);
    const paths = [
      ...(Array.isArray(asset.binaryAttributes) ? asset.binaryAttributes.flatMap((entry: unknown) => isRecord(entry) && typeof entry.path === "string" ? [entry.path] : []) : []),
      ...(isRecord(asset.binaryIndices) && typeof asset.binaryIndices.path === "string" ? [asset.binaryIndices.path] : []),
    ].sort();
    const bytes = await Promise.all(paths.map((path) => readFile(resolve(bundlePath, path))));
    const hash = createHash("sha256");
    for (const value of bytes) hash.update(value);
    return { bytes: bytes.reduce((sum, value) => sum + value.byteLength, 0), id, sha256: hash.digest("hex"), triangleCount: triangleCounts[id]! };
  }));
  return {
    baseMesh: renderer.mesh,
    cameraEntity: activeCameraEntity(world),
    entity: owner.id,
    invariant: {
      collider: components.Collider ?? null,
      hierarchy: components.Hierarchy ?? null,
      layers: components.RenderLayers ?? null,
      material: renderer.material ?? null,
      shadows: { cast: renderer.castShadow ?? false, receive: renderer.receiveShadow ?? false },
      transform: components.Transform ?? null,
      visibility: renderer.visible ?? true,
    },
    levels,
    payloads,
    payloadSizes: { baseBytes: payloads[0]!.bytes, totalBytes: payloads.reduce((sum, payload) => sum + payload.bytes, 0) },
    triangleCounts,
  };
}

async function writeRuntimeInvariantReports(root: string, bundlePath: string, fixtureId: string, artifactDir: string, contract: GeneratedMeshLodContract): Promise<{ invariants: GeneratedMeshLodRuntimeInvariants }> {
  const reportsDir = resolve(artifactDir, "reports");
  await mkdir(reportsDir, { recursive: true });
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as {
    loadBundle(path: string): Promise<unknown>;
    mapWorld(bundle: unknown): unknown;
    reportWebConformance(bundle: unknown, mapped: unknown, fixture: string): unknown;
  };
  const bundle = await runtime.loadBundle(bundlePath);
  const webReport = runtime.reportWebConformance(bundle, runtime.mapWorld(bundle), fixtureId);
  const webPath = resolve(reportsDir, "web.report.json");
  const nativePath = resolve(reportsDir, "native.report.json");
  await writeFile(webPath, `${JSON.stringify(webReport, null, 2)}\n`, "utf8");
  await execFileAsync("cargo", ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_conformance", "--", bundlePath, fixtureId, nativePath], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  const nativeReport = JSON.parse(await readFile(nativePath, "utf8")) as unknown;
  return { invariants: { native: invariantFromReport(nativeReport, contract.entity), web: invariantFromReport(webReport, contract.entity) } };
}

function invariantFromReport(report: unknown, entityId: string): RuntimeInvariantObservation {
  if (!isRecord(report) || !Array.isArray(report.entities)) throw new Error("Runtime invariant conformance report is malformed.");
  const entity = report.entities.find((value: unknown) => isRecord(value) && value.id === entityId);
  if (!isRecord(entity)) throw new Error(`Runtime invariant conformance report is missing '${entityId}'.`);
  const renderer = isRecord(entity.meshRenderer) ? entity.meshRenderer : {};
  const components = Array.isArray(entity.components) ? entity.components : [];
  return {
    collider: components.includes("Collider"),
    hierarchy: typeof entity.parent === "string" ? entity.parent : null,
    layers: components.includes("RenderLayers"),
    material: typeof entity.material === "string" ? entity.material : null,
    shadows: { cast: renderer.castShadow === true, receive: renderer.receiveShadow === true },
    transform: entity.transform ?? null,
    visibility: renderer.visible !== false,
  };
}

function expectedRuntimeInvariant(invariant: Record<string, unknown>): RuntimeInvariantObservation {
  const hierarchy = isRecord(invariant.hierarchy) && typeof invariant.hierarchy.parent === "string" ? invariant.hierarchy.parent : null;
  const shadows = isRecord(invariant.shadows) ? invariant.shadows : {};
  return {
    collider: invariant.collider !== null,
    hierarchy,
    layers: invariant.layers !== null,
    material: typeof invariant.material === "string" ? invariant.material : null,
    shadows: { cast: shadows.cast === true, receive: shadows.receive === true },
    transform: invariant.transform ?? null,
    visibility: invariant.visibility !== false,
  };
}

async function readBookmarks(bundlePath: string): Promise<Record<LodState, { id: string; position: [number, number, number] }>> {
  const environment = JSON.parse(await readFile(resolve(bundlePath, "environment.scene.json"), "utf8")) as unknown;
  if (!isRecord(environment) || !Array.isArray(environment.bookmarks)) throw new Error("Generated mesh LOD fixture requires environment bookmarks.");
  return Object.fromEntries(STATES.map((state) => {
    const aliases = state.startsWith("threshold-")
      ? [state, state.replace("threshold-", "threshold."), state.replace("threshold-", "threshold")]
      : [state];
    const bookmark = environment.bookmarks.find((value: unknown) => isRecord(value) && typeof value.id === "string" && aliases.some((alias) => value.id === alias || value.id.endsWith(`.${alias}`)));
    if (!isRecord(bookmark) || typeof bookmark.id !== "string" || !isVec3(bookmark.position)) throw new Error(`Generated mesh LOD fixture is missing the '${state}' bookmark.`);
    return [state, { id: bookmark.id, position: bookmark.position }];
  })) as Record<LodState, { id: string; position: [number, number, number] }>;
}

async function captureWebStates(root: string, bundlePath: string, screenshotsDir: string, tracesDir: string, bookmarks: Record<LodState, { id: string; position: [number, number, number] }>, entity: string, cameraEntity: string): Promise<Record<LodState, { screenshotPath: string; selection: MeshLodTraceSelection }>> {
  const { startWebPreview } = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as { startWebPreview(options: { bundlePath: string; silent: boolean }): Promise<{ close(): Promise<void> | void; url: string }> };
  const server = await startWebPreview({ bundlePath, silent: true });
  const browser = await chromium.launch({ headless: true });
  const result = {} as Record<LodState, { screenshotPath: string; selection: MeshLodTraceSelection }>;
  try {
    for (const state of STATES) {
      const context = await browser.newContext({ viewport: { height: 720, width: 1280 } });
      try {
        const page = await context.newPage();
        const failures: string[] = [];
        page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
        page.on("pageerror", (error) => failures.push(error.message));
        const url = new URL(server.url);
        url.searchParams.set("bundle", "/bundle");
        url.searchParams.set("capture", "1");
        await page.goto(url.href, { waitUntil: "domcontentloaded" });
        await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__) && Boolean(globalThis.__THREENATIVE_RUNTIME__?.meshLodSnapshot)", undefined, { timeout: 10_000 });
        const moved = await page.evaluate(({ id, position }) => (globalThis as any).__THREENATIVE_RUNTIME__.setEntityTransform(id, { position }), { id: cameraEntity, position: bookmarks[state].position });
        if (moved !== true) throw new Error(`Web generated-mesh LOD '${state}' capture could not position '${cameraEntity}'.`);
        await page.waitForTimeout(300);
        const observedCameraPosition = await page.evaluate((id) => (globalThis as any).__THREENATIVE_RUNTIME__.entityWorldPosition(id), cameraEntity);
        if (!isVec3(observedCameraPosition) || observedCameraPosition.some((value, index) => Math.abs(value - bookmarks[state].position[index]!) > 0.000001)) throw new Error(`Web generated-mesh LOD '${state}' bookmark position was not applied.`);
        const trace = await page.evaluate(() => (globalThis as any).__THREENATIVE_RUNTIME__.meshLodSnapshot());
        const screenshotPath = resolve(screenshotsDir, `${state}.web.png`);
        await page.locator("canvas").screenshot({ path: screenshotPath });
        await writeFile(resolve(tracesDir, `${state}.web.trace.json`), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
        result[state] = { screenshotPath, selection: selectionFromTrace(trace, entity) };
        if (failures.length > 0) throw new Error(`Web generated-mesh LOD '${state}' capture failed: ${failures[0]}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return result;
}

async function captureNativeState(root: string, bundlePath: string, bookmark: string, screenshotPath: string, tracePath: string): Promise<void> {
  await rm(screenshotPath, { force: true });
  await rm(tracePath, { force: true });
  const args = ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, bookmark, screenshotPath, "300", "--mesh-lod-trace", tracePath];
  try {
    await execFileAsync("xvfb-run", ["-a", "cargo", ...args], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") await execFileAsync("cargo", args, { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
    else throw error;
  }
}

function selectionFromTrace(value: unknown, entity: string): MeshLodTraceSelection {
  const entries = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.meshLod) ? value.meshLod : undefined;
  const selection = entries?.find((entry) => isRecord(entry) && entry.entity === entity);
  if (!isRecord(selection) || typeof selection.entity !== "string" || typeof selection.selectedMesh !== "string" || typeof selection.threshold !== "number" || !(selection.distance === null || typeof selection.distance === "number")) throw new Error(`Mesh LOD trace is missing '${entity}'.`);
  return selection as unknown as MeshLodTraceSelection;
}

async function analyzePair(webPath: string, nativePath: string): Promise<MeshLodScreenshotMetrics> {
  const [webBytes, nativeBytes] = await Promise.all([readFile(webPath), readFile(nativePath)]);
  const web = PNG.sync.read(webBytes);
  const native = PNG.sync.read(nativeBytes);
  if (web.width !== native.width || web.height !== native.height) throw new Error("Generated mesh LOD paired captures must have identical dimensions.");
  const webBackground = [web.data[0]!, web.data[1]!, web.data[2]!] as const;
  const nativeBackground = [native.data[0]!, native.data[1]!, native.data[2]!] as const;
  let webForeground = 0; let nativeForeground = 0; let union = 0; let intersection = 0; let colorDelta = 0;
  const pixels = web.width * web.height;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const webOn = rgbDistance(web.data, offset, webBackground) > 24;
    const nativeOn = rgbDistance(native.data, offset, nativeBackground) > 24;
    if (webOn) webForeground += 1;
    if (nativeOn) nativeForeground += 1;
    if (webOn || nativeOn) { union += 1; colorDelta += (Math.abs(web.data[offset]! - native.data[offset]!) + Math.abs(web.data[offset + 1]! - native.data[offset + 1]!) + Math.abs(web.data[offset + 2]! - native.data[offset + 2]!)) / (3 * 255); }
    if (webOn && nativeOn) intersection += 1;
  }
  return { colorMae: colorDelta / Math.max(1, union), nativeNonBackgroundFraction: nativeForeground / pixels, silhouetteDelta: 1 - intersection / Math.max(1, union), webNonBackgroundFraction: webForeground / pixels };
}

function rgbDistance(data: Uint8Array, offset: number, background: readonly number[]): number { return Math.abs(data[offset]! - background[0]!) + Math.abs(data[offset + 1]! - background[1]!) + Math.abs(data[offset + 2]! - background[2]!); }
function activeCameraEntity(world: Record<string, any>): string {
  const active = isRecord(world.resources) && isRecord(world.resources.ActiveCamera) ? world.resources.ActiveCamera.entity : undefined;
  if (typeof active !== "string") throw new Error("Generated mesh LOD fixture requires resources.ActiveCamera.entity.");
  return active;
}
function isVec3(value: unknown): value is [number, number, number] { return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)); }
function distanceMatchesState(state: LodState, distance: number | null, levels: GeneratedMeshLodContract["levels"]): boolean {
  if (distance === null || !Number.isFinite(distance)) return false;
  const [first, second] = levels;
  if (first === undefined || second === undefined) return false;
  if (state === "near") return distance < first.minDistance;
  if (state === "threshold-1") return distance >= first.minDistance && distance < second.minDistance;
  return distance >= second.minDistance;
}

function renderContactSheet(states: readonly GeneratedMeshLodStateEvidence[]): string {
  const rows = states.map((state, index) => `<text x="30" y="${35 + index * 390}" fill="#fff">${state.state}: web / native, silhouette=${state.webMetrics.silhouetteDelta.toFixed(4)}, color=${state.webMetrics.colorMae.toFixed(4)}</text>\n<image x="30" y="${50 + index * 390}" width="640" height="360" href="screenshots/${state.state}.web.png"/>\n<image x="700" y="${50 + index * 390}" width="640" height="360" href="screenshots/${state.state}.native.png"/>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1370" height="${states.length * 390 + 30}" viewBox="0 0 1370 ${states.length * 390 + 30}"><rect width="100%" height="100%" fill="#111318"/>${rows}</svg>\n`;
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic { return { code, message, path, severity: "error", suggestedFix: `Rerun '${GATE_NAME}' and inspect paired screenshots, trace selections, fixture thresholds, and shared object invariants.` }; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runGeneratedMeshLodGate();
  process.stdout.write(`${JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok, reportPath: result.reportPath }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
