import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Locator, Page } from "playwright";

export interface IEditorE2eFixture {
  bootConfigPath: string;
  projectPath: string;
  tempRoot: string;
}

export interface IProjectInventory {
  paths: string[];
}

export interface ISceneDocument {
  entities: Array<{ components?: Record<string, unknown>; id: string; label?: string; prefab?: string; transform?: unknown }>;
  id?: string;
  prefabs: Array<{ asset?: string; color?: string; id: string; primitive?: string }>;
  resources?: unknown[];
  schema?: string;
  systems?: unknown[];
  ui?: unknown;
  version?: string;
}

export interface IWorldDocument {
  entities: Array<{
    components?: {
      Camera?: { kind?: string };
      Light?: { intensity?: number; kind?: string };
      MeshRenderer?: { material?: string; mesh?: string };
      Transform?: { position?: number[] };
    };
    id: string;
  }>;
}

export interface IMaterialsDocument {
  materials: Array<{ color?: string; id: string }>;
}

export interface IAssetsManifestDocument {
  assets: Array<{ id?: string; path?: string }>;
}

export interface IEnvironmentSceneDocument {
  id?: string;
  path?: { id?: string };
  skybox?: { asset?: string; mode?: string };
  terrain?: { heightmap?: string; heightMode?: string; id?: string };
  walkability?: unknown;
}

export async function createEditorE2eFixture(root: string): Promise<IEditorE2eFixture> {
  const tempRoot = await mkdtemp(join(tmpdir(), "tn-editor-e2e-"));
  const projectPath = join(tempRoot, "project");
  await cp(resolve(root, "templates/structured-source-starter"), projectPath, { recursive: true });
  await writeEditorVisualScene(projectPath);
  const bootConfigPath = join(projectPath, ".threenative", "editor-boot.json");
  await mkdir(join(projectPath, ".threenative"), { recursive: true });
  await writeFile(
    bootConfigPath,
    `${JSON.stringify(
      {
        projectPath,
        schema: "threenative.editor-boot",
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
  );
  return { bootConfigPath, projectPath, tempRoot };
}

export async function writeEditorVisualScene(projectPath: string): Promise<void> {
  await copyEditorModelAssets(projectPath);
  const scene: ISceneDocument = {
    entities: [
      {
        components: { camera: { mode: "perspective", target: "terrain-0" } },
        id: "main-camera",
        transform: { position: [2.8, 2.8, 1.1] },
      },
      {
        components: { Light: { color: "#ffffff", intensity: 1, kind: "directional" } },
        id: "directional-light",
        transform: { position: [-2, 3, 2] },
      },
      {
        components: { Light: { color: "#ffffff", intensity: 0.4, kind: "ambient" } },
        id: "ambient-light",
        transform: { position: [-2.4, 2.4, -1.2] },
      },
      {
        id: "terrain-0",
        prefab: "prefab.terrain-0",
        transform: { position: [0, -0.05, 0], rotation: [-1.570796, 0, 0], scale: [1, 1, 1] },
      },
      {
        id: "farm-house-basic-shaded-0",
        prefab: "prefab.farm-house-basic-shaded-0",
        transform: { position: [9.8, 0, 1.2], rotation: [0, -0.45, 0], scale: [1.55, 1.55, 1.55] },
      },
      {
        id: "base-basic-shaded-0",
        prefab: "prefab.base-basic-shaded-0",
        transform: { position: [-1.2, 0, -0.5], scale: [1.65, 1.65, 1.65] },
      },
    ],
    prefabs: [
      { color: "#075d18", id: "prefab.terrain-0", primitive: "plane" },
      { asset: "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb", color: "#9c3a16", id: "prefab.farm-house-basic-shaded-0", primitive: "box" },
      { asset: "assets/models/base_basic_shaded/base_basic_shaded.glb", color: "#66a80f", id: "prefab.base-basic-shaded-0", primitive: "sphere" },
    ],
    id: "arena",
    resources: [],
    schema: "threenative.scene",
    systems: [],
    ui: { nodes: [] },
    version: "0.1.0",
  } as ISceneDocument;
  await writeFile(join(projectPath, "content", "scenes", "arena.scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
  await mkdir(join(projectPath, "content", "input"), { recursive: true });
  await mkdir(join(projectPath, "content", "systems"), { recursive: true });
  await mkdir(join(projectPath, "content", "assets"), { recursive: true });
  await mkdir(join(projectPath, "content", "environment"), { recursive: true });
  await writeFile(
    join(projectPath, "content", "assets", "models.assets.json"),
    `${JSON.stringify({
      schema: "threenative.assets",
      version: "0.1.0",
      id: "models",
      assets: [
        { id: "model.farm_house", path: "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb", type: "model" },
        { id: "model.base_basic", path: "assets/models/base_basic_shaded/base_basic_shaded.glb", type: "model" },
      ],
    }, null, 2)}\n`,
  );
  await writeFile(
    join(projectPath, "content", "environment", "arena.environment.json"),
    `${JSON.stringify({
      schema: "threenative.environment-scene",
      version: "0.1.0",
      id: "arena-environment",
      environmentMap: { asset: "tex.sky" },
      sourceAssets: [{ id: "env.Tree", lod: [{ asset: "model.base_basic", maxDistance: 48 }] }],
      instances: [],
      path: { id: "path.main", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
      skybox: { asset: "tex.sky", mode: "equirect" },
      terrain: { bounds: { min: [-4, 0, -4], max: [4, 0, 4] }, heightMode: "flat", id: "terrain.editor" },
      walkability: {
        blockers: [],
        movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
        regions: [],
        terrain: { height: 0, surface: "terrain.editor" },
      },
    }, null, 2)}\n`,
  );
  await writeFile(
    join(projectPath, "content", "input", "arena.input.json"),
    `${JSON.stringify({ schema: "threenative.input", version: "0.1.0", id: "arena", actions: [{ id: "jump", bindings: ["keyboard.Space"] }] }, null, 2)}\n`,
  );
  await writeFile(
    join(projectPath, "content", "systems", "arena.systems.json"),
    `${JSON.stringify({ schema: "threenative.systems", version: "0.1.0", id: "arena", systems: [{ id: "spin", schedule: "update", script: { module: "./spin.ts", export: "spin" } }] }, null, 2)}\n`,
  );
  await writeFile(join(projectPath, "spin.ts"), "export function spin() {}\n");
}

export async function copyEditorModelAssets(projectPath: string): Promise<void> {
  const sourceRoot = "/home/joao/projects/vibe-coder-3d/public/assets/models";
  await mkdir(join(projectPath, "assets", "models", "FarmHouse", "glb"), { recursive: true });
  await mkdir(join(projectPath, "assets", "models", "base_basic_shaded"), { recursive: true });
  await cp(join(sourceRoot, "FarmHouse", "glb", "farm_house_basic_shaded.glb"), join(projectPath, "assets", "models", "FarmHouse", "glb", "farm_house_basic_shaded.glb"));
  await cp(join(sourceRoot, "base_basic_shaded", "base_basic_shaded.glb"), join(projectPath, "assets", "models", "base_basic_shaded", "base_basic_shaded.glb"));
}

export async function readProjectInventory(page: Page): Promise<IProjectInventory> {
  return page.evaluate(async () => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { documents?: Array<{ documents: Array<{ path: string }> }> };
    return {
      paths: payload.documents?.flatMap((group) => group.documents.map((document) => document.path)).sort() ?? [],
    };
  });
}

export async function waitForOkJsonResponse(page: Page, path: string): Promise<void> {
  const response = await page.waitForResponse((candidate) => candidate.url().endsWith(path) && candidate.request().method() !== "GET", { timeout: 30_000 });
  if (!response.ok()) {
    throw new Error(`${path} returned HTTP ${response.status()}`);
  }
  const payload = (await response.json()) as { diagnostics?: Array<{ message?: string }>; ok?: boolean };
  if (payload.ok !== true) {
    throw new Error(`${path} returned failure: ${payload.diagnostics?.[0]?.message ?? "unknown error"}`);
  }
}

export async function waitForEditorModel(page: Page, assetPath: string): Promise<void> {
  try {
    await page.waitForFunction((expected) => {
      const loaded = (globalThis as unknown as { __tnEditorLoadedModels?: string[] }).__tnEditorLoadedModels ?? [];
      return loaded.includes(expected);
    }, assetPath, { timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      errors: (globalThis as unknown as { __tnEditorModelErrors?: string[] }).__tnEditorModelErrors ?? [],
      loaded: (globalThis as unknown as { __tnEditorLoadedModels?: string[] }).__tnEditorLoadedModels ?? [],
    }));
    throw new Error(`Editor GLB model did not load: ${assetPath}; loaded=${state.loaded.join(",")}; errors=${state.errors.join(" | ")}; ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function assertProjectAssetRoute(page: Page, assetPath: string): Promise<void> {
  const result = await page.evaluate(async (path) => {
    const response = await fetch(`/project-assets/${path}`);
    return { contentType: response.headers.get("content-type"), ok: response.ok, size: (await response.arrayBuffer()).byteLength, status: response.status };
  }, assetPath);
  if (!result.ok || result.size < 1024) {
    throw new Error(`Project asset route failed for ${assetPath}: HTTP ${result.status}, ${result.size} bytes, ${result.contentType ?? "unknown content type"}`);
  }
}

export async function captureCleanVisualState(page: Page, projectPath: string, screenshotPath: string): Promise<void> {
  await writeEditorVisualScene(projectPath);
  await removeGeneratedEditorScenes(projectPath);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByText("base_basic_shaded 0").first().waitFor({ timeout: 10_000 });
  await waitForEditorModel(page, "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb");
  await waitForEditorModel(page, "assets/models/base_basic_shaded/base_basic_shaded.glb");
  await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

export async function removeGeneratedEditorScenes(projectPath: string): Promise<void> {
  const scenesPath = join(projectPath, "content", "scenes");
  const entries = await readdir(scenesPath);
  await Promise.all(entries.filter((entry) => entry.startsWith("editor-scene-") && entry.endsWith(".scene.json")).map((entry) => rm(join(scenesPath, entry), { force: true })));
}

export async function assertTypedInspectorControls(page: Page): Promise<void> {
  await page.locator('input[aria-label="Position X"]').waitFor({ timeout: 10_000 });
  if ((await page.getByRole("combobox", { name: "Primitive" }).inputValue()) !== "sphere") {
    throw new Error("MeshRenderer primitive enum did not render source-backed sphere value.");
  }
  if ((await page.getByRole("textbox", { name: "Color value" }).inputValue()) !== "#66a80f") {
    throw new Error("MeshRenderer color control did not render source-backed color value.");
  }
  if ((await page.locator('input[aria-label="Asset"]').inputValue()) !== "assets/models/base_basic_shaded/base_basic_shaded.glb") {
    throw new Error("MeshRenderer asset picker field did not render source-backed asset reference.");
  }

  await page.getByRole("button", { name: /Main Camera camera/ }).click();
  if ((await page.getByRole("combobox", { exact: true, name: "Mode" }).inputValue()) !== "perspective") {
    throw new Error("Camera mode enum did not render source-backed mode.");
  }
  if ((await page.getByRole("textbox", { exact: true, name: "Target" }).inputValue()) !== "terrain-0") {
    throw new Error("Camera target field did not render source-backed target.");
  }
  if ((await page.getByRole("textbox", { exact: true, name: "Skybox" }).inputValue()) !== "tex.sky") {
    throw new Error("Camera inspector did not render source-backed environment skybox.");
  }

  await page.getByRole("button", { name: /Directional Light light/ }).click();
  if ((await page.getByRole("spinbutton", { name: "Intensity" }).inputValue()) !== "1") {
    throw new Error("Light intensity field did not render source-backed read-only data.");
  }

  await assertSourceDocumentInspectorRows(page);

  await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
}

export async function assertViewportVisualCueSelections(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Main Camera camera/ }).click();
  if ((await page.getByLabel("Name").inputValue()) !== "Main Camera") {
    throw new Error("Camera selection did not update the inspector before viewport visual cue proof.");
  }
  await page.getByRole("button", { name: /Directional Light light/ }).click();
  if ((await page.getByLabel("Name").inputValue()) !== "Directional Light") {
    throw new Error("Light selection did not update the inspector before viewport visual cue proof.");
  }
  await page.getByRole("button", { name: /Terrain 0 entity/ }).click();
  if ((await page.getByLabel("Name").inputValue()) !== "Terrain 0") {
    throw new Error("Terrain selection did not update the inspector before viewport visual cue proof.");
  }
}

export async function assertSourceDocumentInspectorRows(page: Page): Promise<void> {
  const documents = await page.evaluate(async () => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { documents?: Array<{ documents: Array<{ inspectorRows?: Array<{ fieldKind?: string; label: string; value?: string }>; path: string }> }> };
    return payload.documents?.flatMap((group) => group.documents.map((document) => ({ path: document.path, rows: document.inspectorRows ?? [] }))) ?? [];
  });
  const input = documents.find((document) => document.path === "content/input/arena.input.json");
  if (input?.rows.some((row) => row.label === "Bindings" && row.fieldKind === "stringList" && row.value === "keyboard.Space") !== true) {
    throw new Error(`Input document inspector rows did not expose bindings metadata: ${JSON.stringify(input)}`);
  }
  const systems = documents.find((document) => document.path === "content/systems/arena.systems.json");
  if (systems?.rows.some((row) => row.label === "spin Script" && row.fieldKind === "script" && row.value === "./spin.ts#spin") !== true) {
    throw new Error(`Systems document inspector rows did not expose script metadata: ${JSON.stringify(systems)}`);
  }
  const environment = documents.find((document) => document.path === "content/environment/arena.environment.json");
  const environmentRows = environment?.rows ?? [];
  if (environmentRows.some((row) => row.label === "Terrain Height Mode" && row.fieldKind === "enum" && row.value === "flat") !== true) {
    throw new Error(`Environment document inspector rows did not expose terrain height mode: ${JSON.stringify(environment)}`);
  }
  if (environmentRows.some((row) => row.label === "env.Tree LOD" && row.fieldKind === "json") !== true) {
    throw new Error(`Environment document inspector rows did not expose source asset LOD: ${JSON.stringify(environment)}`);
  }
}

export async function assertAddComponentModal(page: Page): Promise<void> {
  await page.getByText("Add Component").click();
  const dialog = page.getByRole("dialog", { name: "Add Component" });
  await dialog.waitFor({ timeout: 10_000 });
  const transform = dialog.getByRole("button", { name: "Transform" });
  const camera = dialog.getByRole("button", { name: "Camera" });
  const script = dialog.getByRole("button", { name: "Script" });
  if (!(await transform.isDisabled())) {
    throw new Error("Add Component did not disable already-attached Transform.");
  }
  if (!(await camera.isDisabled())) {
    throw new Error("Add Component did not disable Camera as incompatible with MeshRenderer.");
  }
  const scriptTitle = await script.getAttribute("title");
  if (
    scriptTitle?.includes('"module":"./systems/update.ts"') !== true ||
    scriptTitle.includes("Pack: scripting") !== true ||
    scriptTitle.includes("Scene and systems script references are edited through promoted script attach operations.") !== true
  ) {
    throw new Error(`Add Component did not expose shared defaults/pack metadata for Script: ${scriptTitle ?? "<missing>"}`);
  }
  if (!(await script.isDisabled())) {
    throw new Error("Add Component did not disable Script as a non-entity component workflow.");
  }
  await page.getByRole("button", { name: "Close Add Component" }).click();
}

export async function assertAddComponentDefaultPersistence(page: Page): Promise<void> {
  await createComponentTarget(page);
  await page.getByRole("button", { name: /component-target entity/ }).click();
  await page.getByText("Add Component").click();
  const dialog = page.getByRole("dialog", { name: "Add Component" });
  await dialog.waitFor({ timeout: 10_000 });
  const transform = dialog.getByRole("button", { name: "Transform" });
  if (await transform.isDisabled()) {
    throw new Error("Add Component disabled Transform for an entity without Transform.");
  }
  await transform.click();
  await page.getByText("Added Transform to component-target").waitFor({ timeout: 10_000 });
  if ((await page.getByRole("spinbutton", { name: "Position X" }).inputValue()) !== "0") {
    throw new Error("Default Transform did not reload into the inspector after Add Component.");
  }
  const persisted = await page.evaluate(async () => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ id: string; position?: number[]; scale?: number[] }> };
    return payload.sceneObjects?.find((object) => object.id === "component-target");
  });
  if (persisted?.position?.join(",") !== "0,0,0" || persisted.scale?.join(",") !== "1,1,1") {
    throw new Error(`Add Component defaults did not persist through structured source operations: ${JSON.stringify(persisted)}`);
  }
  await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
}

export async function createComponentTarget(page: Page): Promise<void> {
  const response = await page.evaluate(async () => {
    const projectResponse = await fetch("/api/project");
    const project = (await projectResponse.json()) as { projectRevision?: string; sceneObjects?: Array<{ id: string }> };
    if (project.sceneObjects?.some((object) => object.id === "component-target") === true) {
      return { ok: true };
    }
    const operationResponse = await fetch("/api/operation", {
      body: JSON.stringify({ args: { entityId: "component-target", sceneId: "arena" }, name: "scene.add_entity", projectRevision: project.projectRevision }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return operationResponse.json() as Promise<{ diagnostics?: Array<{ message?: string }>; ok?: boolean }>;
  });
  if (response.ok !== true) {
    throw new Error(`Could not create component-target for Add Component proof: ${response.diagnostics?.[0]?.message ?? "unknown error"}`);
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("button", { name: /component-target entity/ }).waitFor({ timeout: 10_000 });
}

export async function assertViewportTransformSync(page: Page): Promise<void> {
  const positionX = page.locator('input[aria-label="Position X"]');
  const before = Number(await positionX.inputValue());
  const { bounds } = await waitForViewportCanvas(page, "Editor viewport canvas did not render before transform sync check.");
  await page.mouse.move(bounds.x + bounds.width * 0.47, bounds.y + bounds.height * 0.58);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.58, { steps: 8 });
  await page.mouse.up();
  await waitForPositionInputChange(positionX, before);
  const after = Number(await positionX.inputValue());
  if (!Number.isFinite(after) || after === before) {
    throw new Error(`Viewport transform did not update inspector Position X; before=${before}, after=${after}.`);
  }
  await page.waitForFunction(async (expected) => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ id: string; position?: number[] }> };
    const object = payload.sceneObjects?.find((candidate) => candidate.id === "base-basic-shaded-0");
    return object?.position?.[0] === expected;
  }, after, { timeout: 10_000 });
}

export async function waitForViewportCanvas(page: Page, message: string): Promise<{ bounds: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>; canvas: Locator }> {
  const canvas = page.locator(".tn-editor-viewport-canvas canvas");
  await canvas.waitFor({ state: "attached", timeout: 10_000 });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const bounds = await canvas.boundingBox();
    if (bounds !== null && bounds.width > 0 && bounds.height > 0) {
      return { bounds, canvas };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(message);
}

export async function assertGizmoModeControls(page: Page): Promise<void> {
  await page.locator('button[title="Rotate gizmo mode"]').click();
  await expectGizmoModePressed(page, "Rotate");
  await page.locator('button[title="Scale gizmo mode"]').click();
  await expectGizmoModePressed(page, "Scale");
  await page.locator('button[title="Move gizmo mode"]').click();
  await expectGizmoModePressed(page, "Move");
}

export async function expectGizmoModePressed(page: Page, label: "Move" | "Rotate" | "Scale"): Promise<void> {
  const button = page.locator(`button[title="${label} gizmo mode"]`);
  await button.waitFor({ timeout: 10_000 });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await button.getAttribute("aria-pressed")) === "true") {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`${label} gizmo mode did not become active.`);
}

export async function waitForPositionInputChange(input: Locator, previous: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (Number(await input.inputValue()) !== previous) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for Position X to change from ${previous}.`);
}

export async function readDefaultSceneFromEditor(page: Page): Promise<{ entities: string[] } | undefined> {
  return page.evaluate(async () => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ documentPath?: string; id: string }> };
    const editorSceneObjects = payload.sceneObjects?.filter((object) => object.documentPath?.includes("editor-scene-")) ?? [];
    if (editorSceneObjects.length === 0) {
      return undefined;
    }
    return { entities: editorSceneObjects.map((object) => object.id) };
  });
}

export async function readBodyText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const browserDocument = (globalThis as unknown as { document: { body: { innerText: string } } }).document;
    return browserDocument.body.innerText.replace(/\s+/g, " ").slice(0, 1000);
  });
}

export async function assertModalPlaceholderState(page: Page): Promise<void> {
  await page.locator(".tn-editor-action-icons__add").click();
  const addObjectDialog = page.getByRole("dialog", { name: "Add Object" });
  await addObjectDialog.waitFor({ timeout: 10_000 });
  const terrain = addObjectDialog.getByRole("button", { name: "Terrain" });
  const model = addObjectDialog.getByRole("button", { exact: true, name: "model.base_basic" });
  if (await terrain.isDisabled()) {
    throw new Error("Add Object did not enable source-backed Terrain.");
  }
  if (await model.isDisabled()) {
    throw new Error("Add Object did not enable project model asset actions.");
  }
  if ((await terrain.getAttribute("title")) !== "environment.add_flat_terrain") {
    throw new Error("Terrain Add Object action did not expose its source operation.");
  }
  if ((await model.getAttribute("title")) !== "assets/models/base_basic_shaded/base_basic_shaded.glb") {
    throw new Error("Custom GLB model action did not expose its project asset path.");
  }
  await page.getByRole("button", { name: "Close Add Object" }).click();

  await page.locator(".tn-editor-action-icons").getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete" });
  await deleteDialog.waitFor({ timeout: 10_000 });
  await deleteDialog.getByText("Delete requires a promoted source operation before it is enabled.").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Close Delete" }).click();

  await page.locator(".tn-editor-action-icons").getByRole("button", { name: "Settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.waitFor({ timeout: 10_000 });
  await settingsDialog.getByText("Editor settings are inspect-only in this slice.").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Close Settings" }).click();

  await page.locator('button[title="AI chat"]').click();
  const chatDialog = page.getByRole("dialog", { name: "AI Chat" });
  await chatDialog.waitFor({ timeout: 10_000 });
  if (await chatDialog.getByLabel("AI chat message").isEditable()) {
    throw new Error("AI Chat placeholder textarea should be read-only.");
  }
  await page.getByRole("button", { name: "Close AI Chat" }).click();
}

export async function addObjectThroughModal(page: Page, buttonName: string, entityPrefix: string): Promise<string> {
  const before = await readEditorEntityIds(page, entityPrefix);
  await page.locator(".tn-editor-action-icons__add").click();
  const addObjectDialog = page.getByRole("dialog", { name: "Add Object" });
  await addObjectDialog.waitFor({ timeout: 10_000 });
  const button = addObjectDialog.getByRole("button", { exact: true, name: buttonName });
  if (await button.isDisabled()) {
    throw new Error(`Add Object action ${buttonName} was unexpectedly disabled.`);
  }
  await button.click();
  return readNewEditorEntityId(page, entityPrefix, before);
}

export async function readEditorEntityIds(page: Page, entityPrefix: string): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ id: string }> };
    return payload.sceneObjects?.map((object) => object.id).filter((id) => id.startsWith(prefix)) ?? [];
  }, entityPrefix);
}

export async function readNewEditorEntityId(page: Page, entityPrefix: string, before: readonly string[]): Promise<string> {
  try {
    await page.waitForFunction(async ({ existing, prefix }) => {
      const response = await fetch("/api/project");
      const payload = (await response.json()) as { sceneObjects?: Array<{ id: string }> };
      return payload.sceneObjects?.some((object) => object.id.startsWith(prefix) && !existing.includes(object.id)) ?? false;
    }, { existing: before, prefix: entityPrefix }, { timeout: 60_000 });
  } catch (error) {
    const diagnostics = await readEditorAddObjectDiagnostics(page, entityPrefix);
    throw new Error(
      `Added editor entity with prefix ${entityPrefix} was not visible in the project API. ` +
        `ids=${diagnostics.ids.join(",") || "<none>"}; status=${diagnostics.status || "<none>"}; ` +
        `body=${diagnostics.body}; ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const ids = await readEditorEntityIds(page, entityPrefix);
  const entityId = ids.find((id) => !before.includes(id));
  if (entityId === undefined) {
    throw new Error(`Added editor entity with prefix ${entityPrefix} was not visible in the project API.`);
  }
  return entityId;
}

export async function readEditorAddObjectDiagnostics(page: Page, entityPrefix: string): Promise<{ body: string; ids: string[]; status: string }> {
  return page.evaluate(async (prefix) => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ id: string }> };
    const browserDocument = (globalThis as unknown as { document: { body: { innerText: string }; querySelectorAll: (selector: string) => ArrayLike<{ textContent?: string | null }> } }).document;
    const body = browserDocument.body.innerText.replace(/\s+/g, " ").slice(0, 500);
    const status = Array.from(browserDocument.querySelectorAll(".tn-editor-status__item")).map((node) => node.textContent?.trim() ?? "").filter(Boolean).join(" | ");
    return {
      body,
      ids: payload.sceneObjects?.map((object) => object.id).filter((id) => id.startsWith(prefix)) ?? [],
      status,
    };
  }, entityPrefix);
}

export async function assertEditedProjectEvidence(
  projectPath: string,
  entityIds: { cameraEntityId: string; emptyEntityId: string; entityId: string; lightEntityId: string; modelEntityId: string; terrainEntityId: string },
): Promise<{ assets: IAssetsManifestDocument; environment: IEnvironmentSceneDocument; scene: ISceneDocument; world: IWorldDocument }> {
  const scene = JSON.parse(await readFile(join(projectPath, "content/scenes/arena.scene.json"), "utf8")) as ISceneDocument;
  const world = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/world.ir.json"), "utf8")) as IWorldDocument;
  const materials = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/materials.ir.json"), "utf8")) as IMaterialsDocument;
  const environment = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/environment.scene.json"), "utf8")) as IEnvironmentSceneDocument;
  const assets = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/assets.manifest.json"), "utf8")) as IAssetsManifestDocument;
  const { cameraEntityId, emptyEntityId, entityId, lightEntityId, modelEntityId, terrainEntityId } = entityIds;
  const entity = scene.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) {
    throw new Error(`Source scene did not persist added entity ${entityId}.`);
  }
  if (entity.prefab !== `prefab.${entityId}`) {
    throw new Error(`Source scene entity ${entityId} points at unexpected prefab ${entity.prefab ?? "<missing>"}.`);
  }
  const prefab = scene.prefabs.find((candidate) => candidate.id === `prefab.${entityId}`);
  if (prefab?.primitive !== "sphere" || prefab.color !== "#9b59b6") {
    throw new Error(`Source prefab did not persist selected sphere/color: ${JSON.stringify(prefab)}`);
  }
  const irEntity = world.entities.find((candidate) => candidate.id === entityId);
  if (irEntity?.components?.MeshRenderer?.mesh !== `mesh.${entityId}` || irEntity.components.MeshRenderer.material !== `mat.${entityId}`) {
    throw new Error(`World IR did not emit mesh/material renderer for ${entityId}: ${JSON.stringify(irEntity)}`);
  }
  if (irEntity.components.Transform?.position?.join(",") !== "12,0.5,5") {
    throw new Error(`World IR did not emit expected transform for ${entityId}: ${JSON.stringify(irEntity.components.Transform)}`);
  }
  const material = materials.materials.find((candidate) => candidate.id === `mat.${entityId}`);
  if (material?.color !== "#9b59b6") {
    throw new Error(`Materials IR did not emit selected color for ${entityId}: ${JSON.stringify(material)}`);
  }
  const emptyEntity = scene.entities.find((candidate) => candidate.id === emptyEntityId);
  if (emptyEntity === undefined || emptyEntity.prefab !== undefined || emptyEntity.components !== undefined) {
    throw new Error(`Source scene did not persist empty entity as a source-backed entity: ${JSON.stringify(emptyEntity)}`);
  }
  const cameraEntity = scene.entities.find((candidate) => candidate.id === cameraEntityId);
  if (cameraEntity?.components?.camera === undefined) {
    throw new Error(`Source scene did not persist added camera component: ${JSON.stringify(cameraEntity)}`);
  }
  const lightEntity = scene.entities.find((candidate) => candidate.id === lightEntityId);
  if (lightEntity?.components?.Light === undefined) {
    throw new Error(`Source scene did not persist added Light component: ${JSON.stringify(lightEntity)}`);
  }
  const modelEntity = scene.entities.find((candidate) => candidate.id === modelEntityId);
  const modelPrefab = scene.prefabs.find((candidate) => candidate.id === `prefab.${modelEntityId}`);
  if (modelEntity?.prefab !== `prefab.${modelEntityId}` || modelPrefab?.asset !== "assets/models/base_basic_shaded/base_basic_shaded.glb") {
    throw new Error(`Source scene did not persist added GLB entity/prefab: entity=${JSON.stringify(modelEntity)} prefab=${JSON.stringify(modelPrefab)}`);
  }
  const terrainEntity = scene.entities.find((candidate) => candidate.id === terrainEntityId);
  const terrainPrefab = scene.prefabs.find((candidate) => candidate.id === `prefab.${terrainEntityId}`);
  if (terrainEntity?.prefab !== `prefab.${terrainEntityId}` || terrainPrefab?.primitive !== "plane" || terrainPrefab.color !== "#284f32") {
    throw new Error(`Source scene did not persist added Terrain entity/prefab: entity=${JSON.stringify(terrainEntity)} prefab=${JSON.stringify(terrainPrefab)}`);
  }
  const irTerrain = world.entities.find((candidate) => candidate.id === terrainEntityId);
  if (irTerrain?.components?.MeshRenderer?.mesh !== `mesh.${terrainEntityId}` || irTerrain.components.Transform?.position?.join(",") !== "0,-0.05,0") {
    throw new Error(`World IR did not emit added Terrain renderer/transform: ${JSON.stringify(irTerrain)}`);
  }
  const irCamera = world.entities.find((candidate) => candidate.id === cameraEntityId);
  if (irCamera !== undefined && irCamera.components?.Camera?.kind !== "perspective") {
    throw new Error(`World IR emitted unexpected camera component for ${cameraEntityId}: ${JSON.stringify(irCamera)}`);
  }
  const irLight = world.entities.find((candidate) => candidate.id === lightEntityId);
  if (irLight !== undefined && (irLight.components?.Light?.kind !== "directional" || irLight.components.Light.intensity !== 1)) {
    throw new Error(`World IR emitted unexpected Light component for ${lightEntityId}: ${JSON.stringify(irLight)}`);
  }
  const terrainSourceId = `terrain.editor-${terrainEntityId.slice("editor-terrain-".length)}`;
  if (environment.terrain?.id !== terrainSourceId || environment.terrain.heightMode !== "flat" || environment.path?.id !== "path.main") {
    throw new Error(`Environment artifact did not match source environment expectations: ${JSON.stringify(environment)}`);
  }
  const assetPaths = assets.assets.map((asset) => asset.path).filter((path): path is string => typeof path === "string");
  for (const expected of ["assets/models/FarmHouse/glb/farm_house_basic_shaded.glb", "assets/models/base_basic_shaded/base_basic_shaded.glb"]) {
    if (!assetPaths.includes(expected)) {
      throw new Error(`Assets manifest did not include ${expected}: ${JSON.stringify(assets)}`);
    }
  }
  return { assets, environment, scene, world };
}

export function findOpenPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address !== null) {
          resolvePort(address.port);
        } else {
          rejectPort(new Error("Could not allocate editor E2E port."));
        }
      });
    });
  });
}

export async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`);
}
