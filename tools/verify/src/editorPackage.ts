import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium, type Locator, type Page } from "playwright";

import { stopProcess, type VerificationReport } from "./runner.js";

export interface IEditorPackageArtifacts extends Record<string, unknown> {
  assetsManifest: string;
  editedScreenshot: string;
  environmentScene: string;
  report: string;
  sourceScene: string;
  smokeScreenshot: string;
  worldIr: string;
}

export function editorPackageArtifactPaths(root = process.cwd()): IEditorPackageArtifacts {
  const artifactRoot = resolve(root, "tools/verify/artifacts/editor-package");
  return {
    assetsManifest: resolve(artifactRoot, "assets.after-edit.manifest.json"),
    editedScreenshot: resolve(artifactRoot, "editor-package-edited.png"),
    environmentScene: resolve(artifactRoot, "environment.after-edit.scene.json"),
    report: resolve(artifactRoot, "editor-package-report.json"),
    sourceScene: resolve(artifactRoot, "arena.scene.after-edit.json"),
    smokeScreenshot: resolve(artifactRoot, "editor-package-smoke.png"),
    worldIr: resolve(artifactRoot, "world.after-edit.ir.json"),
  };
}

export async function runEditorPackageGate(root = process.cwd()): Promise<VerificationReport<IEditorPackageArtifacts>> {
  const artifacts = editorPackageArtifactPaths(root);
  const artifactRoot = resolve(root, "tools/verify/artifacts/editor-package");
  await mkdir(artifactRoot, { recursive: true });
  const fixture = await createEditorE2eFixture(root);
  const port = await findOpenPort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn("pnpm", ["--dir", resolve(root, "packages/editor"), "exec", "vite", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    detached: process.platform !== "win32",
    env: { ...process.env, THREENATIVE_EDITOR_BOOT: fixture.bootConfigPath },
    stdio: ["ignore", "ignore", "ignore"],
  });
  const startedAt = new Date().toISOString();
  const steps = [];
  const diagnostics = [];
  let ok = false;
  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { height: 924, width: 1913 } });
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      await waitForHttp(url, 30_000);
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      for (const text of ["ThreeNative", "Hierarchy", "Inspector", "Viewport", "Main Camera", "Directional Light", "Ambient Light", "Terrain 0", "farm_house_basic_shaded 0", "base_basic_shaded 0"]) {
        await page.getByText(text).first().waitFor({ timeout: 10_000 });
      }
      await assertProjectAssetRoute(page, "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb");
      await assertProjectAssetRoute(page, "assets/models/base_basic_shaded/base_basic_shaded.glb");
      await waitForEditorModel(page, "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb");
      await waitForEditorModel(page, "assets/models/base_basic_shaded/base_basic_shaded.glb");
      const inventory = await readProjectInventory(page);
      if (
        !inventory.paths.includes("content/scenes/arena.scene.json") ||
        !inventory.paths.includes("content/assets/models.assets.json") ||
        !inventory.paths.includes("content/environment/arena.environment.json") ||
        !inventory.paths.includes("content/materials/arena.materials.json") ||
        !inventory.paths.includes("content/input/arena.input.json") ||
        !inventory.paths.includes("content/systems/arena.systems.json")
      ) {
        throw new Error(`Editor project inventory did not include expected source documents: ${inventory.paths.join(", ")}`);
      }
      await page.getByText("LOD:").waitFor({ timeout: 10_000 });
      await page.getByText(/Triangles:/).waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await page.getByLabel("Name").waitFor({ timeout: 10_000 });
      if ((await page.getByLabel("Name").inputValue()) !== "base_basic_shaded 0") {
        throw new Error("Inspector did not update after selecting base_basic_shaded 0 in the hierarchy.");
      }
      await assertTypedInspectorControls(page);
      await assertViewportVisualCueSelections(page);
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await assertAddComponentDefaultPersistence(page);
      await page.getByRole("button", { name: /farm_house_basic_shaded 0 entity/ }).dragTo(page.getByRole("button", { name: /base_basic_shaded 0 entity/ }));
      await page.getByText("Nested farm_house_basic_shaded 0 under base_basic_shaded 0 in editor view").waitFor({ timeout: 10_000 });
      await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
      await page.getByText("base_basic_shaded 0").first().waitFor({ timeout: 10_000 });
      const canvas = page.locator(".tn-editor-viewport-canvas canvas");
      const canvasBounds = await canvas.boundingBox();
      if (canvasBounds === null) {
        throw new Error("Editor viewport canvas did not render.");
      }
      await canvas.click({ position: { x: canvasBounds.width * 0.5, y: canvasBounds.height * 0.55 } });
      const selectedFromViewport = await page.getByLabel("Name").inputValue();
      if (selectedFromViewport !== "Terrain 0" && selectedFromViewport !== "base_basic_shaded 0" && selectedFromViewport !== "component-target") {
        throw new Error(`Viewport click did not select an expected scene object; inspector ID is '${selectedFromViewport}'.`);
      }
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await assertViewportTransformSync(page);
      await assertGizmoModeControls(page);
      await page.screenshot({ path: artifacts.smokeScreenshot, fullPage: true });

      await assertModalPlaceholderState(page);
      const entityId = await addObjectThroughModal(page, "Primitive Sphere", "editor-box-");
      const emptyEntityId = await addObjectThroughModal(page, "Empty Entity", "editor-entity-");
      const cameraEntityId = await addObjectThroughModal(page, "Camera", "editor-camera-");
      const lightEntityId = await addObjectThroughModal(page, "Light", "editor-light-");
      const modelEntityId = await addObjectThroughModal(page, "model.base_basic", "editor-model-");

      await page.getByRole("button", { name: "Build preview" }).click();
      const buildDialog = page.getByRole("dialog", { name: "Build Preview" });
      await buildDialog.waitFor({ timeout: 10_000 });
      await buildDialog.getByRole("button", { exact: true, name: "Build" }).click();
      await page.getByText(/Built /).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await assertAddComponentModal(page);

      const evidence = await assertEditedProjectEvidence(fixture.projectPath, { cameraEntityId, emptyEntityId, entityId, lightEntityId, modelEntityId });
      await writeFile(artifacts.sourceScene, `${JSON.stringify(evidence.scene, null, 2)}\n`);
      await writeFile(artifacts.worldIr, `${JSON.stringify(evidence.world, null, 2)}\n`);
      await writeFile(artifacts.environmentScene, `${JSON.stringify(evidence.environment, null, 2)}\n`);
      await writeFile(artifacts.assetsManifest, `${JSON.stringify(evidence.assets, null, 2)}\n`);
      await page.getByRole("button", { name: "New scene" }).click();
      const newSceneDialog = page.getByRole("dialog", { name: "New Scene" });
      await newSceneDialog.waitFor({ timeout: 10_000 });
      await newSceneDialog.getByRole("button", { exact: true, name: "Create Scene" }).click();
      await page.getByText(/Created editor-scene-/).waitFor({ timeout: 10_000 });
      const defaultScene = await readDefaultSceneFromEditor(page);
      if (defaultScene === undefined) {
        throw new Error("New scene action did not create a default editor scene.");
      }
      if (defaultScene.entities.join(",") !== "main-camera,directional-light,ambient-light") {
        throw new Error(`Default editor scene entities were not seeded correctly: ${defaultScene.entities.join(",")}`);
      }
      await page.getByRole("button", { name: "Save" }).click();
      const saveDialog = page.getByRole("dialog", { name: "Save Scene" });
      await saveDialog.waitFor({ timeout: 10_000 });
      await saveDialog.getByRole("button", { exact: true, name: "Save" }).click();
      await page.getByText(/Saved scene sources;/).waitFor({ timeout: 10_000 });
      await captureCleanVisualState(page, fixture.projectPath, artifacts.editedScreenshot);
      const unexpectedConsoleErrors = consoleErrors.filter((error) => !error.startsWith("THREE.GLTFLoader: Couldn't load texture blob:"));
      if (unexpectedConsoleErrors.length > 0) {
        throw new Error(`Editor browser console reported errors: ${unexpectedConsoleErrors.join(" | ")}`);
      }
      ok = true;
      steps.push({
        durationMs: 0,
        exitCode: 0,
        name: "editor-e2e",
        stderr: "",
        stdout: `Editor shell rendered, project inventory loaded, added ${entityId}/${emptyEntityId}/${cameraEntityId}/${lightEntityId}/${modelEntityId}, built preview, and persisted source/IR/environment/assets evidence.`,
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    diagnostics.push({
      code: "TN_VERIFY_EDITOR_PACKAGE_E2E_FAILED",
      message: error instanceof Error ? error.message : String(error),
      severity: "error" as const,
      suggestedFix: "Run pnpm --filter @threenative/editor dev and inspect the browser console.",
    });
    steps.push({ durationMs: 0, exitCode: 1, name: "editor-e2e", stderr: String(error), stdout: "" });
  } finally {
    stopProcess(server);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  const report: VerificationReport<IEditorPackageArtifacts> = {
    artifacts,
    code: "TN_VERIFY_EDITOR_PACKAGE",
    diagnostics,
    generatedBy: "tools/verify/editorPackage",
    ok,
    schema: "threenative.verification-report",
    startedAt,
    status: ok ? "pass" : "fail",
    steps,
    version: "0.1.0",
  };
  await writeFile(artifacts.report, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

interface IEditorE2eFixture {
  bootConfigPath: string;
  projectPath: string;
  tempRoot: string;
}

interface IProjectInventory {
  paths: string[];
}

interface ISceneDocument {
  entities: Array<{ components?: Record<string, unknown>; id: string; label?: string; prefab?: string; transform?: unknown }>;
  id?: string;
  prefabs: Array<{ asset?: string; color?: string; id: string; primitive?: string }>;
  resources?: unknown[];
  schema?: string;
  systems?: unknown[];
  ui?: unknown;
  version?: string;
}

interface IWorldDocument {
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

interface IMaterialsDocument {
  materials: Array<{ color?: string; id: string }>;
}

interface IAssetsManifestDocument {
  assets: Array<{ id?: string; path?: string }>;
}

interface IEnvironmentSceneDocument {
  id?: string;
  path?: { id?: string };
  skybox?: { asset?: string; mode?: string };
  terrain?: { heightmap?: string; heightMode?: string; id?: string };
  walkability?: unknown;
}

async function createEditorE2eFixture(root: string): Promise<IEditorE2eFixture> {
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

async function writeEditorVisualScene(projectPath: string): Promise<void> {
  await copyEditorModelAssets(projectPath);
  const scene: ISceneDocument = {
    entities: [
      {
        components: { camera: { mode: "perspective", target: "terrain-0" } },
        id: "main-camera",
        transform: { position: [2.8, 2.8, 1.1] },
      },
      {
        components: { Light: { intensity: 1, kind: "directional" } },
        id: "directional-light",
        transform: { position: [-2, 3, 2] },
      },
      {
        components: { Light: { intensity: 0.4, kind: "ambient" } },
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

async function copyEditorModelAssets(projectPath: string): Promise<void> {
  const sourceRoot = "/home/joao/projects/vibe-coder-3d/public/assets/models";
  await mkdir(join(projectPath, "assets", "models", "FarmHouse", "glb"), { recursive: true });
  await mkdir(join(projectPath, "assets", "models", "base_basic_shaded"), { recursive: true });
  await cp(join(sourceRoot, "FarmHouse", "glb", "farm_house_basic_shaded.glb"), join(projectPath, "assets", "models", "FarmHouse", "glb", "farm_house_basic_shaded.glb"));
  await cp(join(sourceRoot, "base_basic_shaded", "base_basic_shaded.glb"), join(projectPath, "assets", "models", "base_basic_shaded", "base_basic_shaded.glb"));
}

async function readProjectInventory(page: Page): Promise<IProjectInventory> {
  return page.evaluate(async () => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { documents?: Array<{ documents: Array<{ path: string }> }> };
    return {
      paths: payload.documents?.flatMap((group) => group.documents.map((document) => document.path)).sort() ?? [],
    };
  });
}

async function waitForOkJsonResponse(page: Page, path: string): Promise<void> {
  const response = await page.waitForResponse((candidate) => candidate.url().endsWith(path) && candidate.request().method() !== "GET", { timeout: 30_000 });
  if (!response.ok()) {
    throw new Error(`${path} returned HTTP ${response.status()}`);
  }
  const payload = (await response.json()) as { diagnostics?: Array<{ message?: string }>; ok?: boolean };
  if (payload.ok !== true) {
    throw new Error(`${path} returned failure: ${payload.diagnostics?.[0]?.message ?? "unknown error"}`);
  }
}

async function waitForEditorModel(page: Page, assetPath: string): Promise<void> {
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

async function assertProjectAssetRoute(page: Page, assetPath: string): Promise<void> {
  const result = await page.evaluate(async (path) => {
    const response = await fetch(`/project-assets/${path}`);
    return { contentType: response.headers.get("content-type"), ok: response.ok, size: (await response.arrayBuffer()).byteLength, status: response.status };
  }, assetPath);
  if (!result.ok || result.size < 1024) {
    throw new Error(`Project asset route failed for ${assetPath}: HTTP ${result.status}, ${result.size} bytes, ${result.contentType ?? "unknown content type"}`);
  }
}

async function captureCleanVisualState(page: Page, projectPath: string, screenshotPath: string): Promise<void> {
  await writeEditorVisualScene(projectPath);
  await removeGeneratedEditorScenes(projectPath);
  await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
  await page.getByText("base_basic_shaded 0").first().waitFor({ timeout: 10_000 });
  await waitForEditorModel(page, "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb");
  await waitForEditorModel(page, "assets/models/base_basic_shaded/base_basic_shaded.glb");
  await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

async function removeGeneratedEditorScenes(projectPath: string): Promise<void> {
  const scenesPath = join(projectPath, "content", "scenes");
  const entries = await readdir(scenesPath);
  await Promise.all(entries.filter((entry) => entry.startsWith("editor-scene-") && entry.endsWith(".scene.json")).map((entry) => rm(join(scenesPath, entry), { force: true })));
}

async function assertTypedInspectorControls(page: Page): Promise<void> {
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

async function assertViewportVisualCueSelections(page: Page): Promise<void> {
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

async function assertSourceDocumentInspectorRows(page: Page): Promise<void> {
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

async function assertAddComponentModal(page: Page): Promise<void> {
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
  if (scriptTitle?.includes('"module":"./systems/update.ts"') !== true || scriptTitle.includes("Pack: scripting") !== true) {
    throw new Error(`Add Component did not expose shared defaults/pack metadata for Script: ${scriptTitle ?? "<missing>"}`);
  }
  if (await script.isDisabled()) {
    throw new Error("Add Component unexpectedly disabled compatible Script definition.");
  }
  await page.getByRole("button", { name: "Close Add Component" }).click();
}

async function assertAddComponentDefaultPersistence(page: Page): Promise<void> {
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

async function createComponentTarget(page: Page): Promise<void> {
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
  await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
  await page.getByRole("button", { name: /component-target entity/ }).waitFor({ timeout: 10_000 });
}

async function assertViewportTransformSync(page: Page): Promise<void> {
  const positionX = page.locator('input[aria-label="Position X"]');
  const before = Number(await positionX.inputValue());
  const canvas = page.locator(".tn-editor-viewport-canvas canvas");
  const bounds = await canvas.boundingBox();
  if (bounds === null) {
    throw new Error("Editor viewport canvas did not render before transform sync check.");
  }
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

async function assertGizmoModeControls(page: Page): Promise<void> {
  await page.locator('button[title="Rotate gizmo mode"]').click();
  await expectGizmoModePressed(page, "Rotate");
  await page.locator('button[title="Scale gizmo mode"]').click();
  await expectGizmoModePressed(page, "Scale");
  await page.locator('button[title="Move gizmo mode"]').click();
  await expectGizmoModePressed(page, "Move");
}

async function expectGizmoModePressed(page: Page, label: "Move" | "Rotate" | "Scale"): Promise<void> {
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

async function waitForPositionInputChange(input: Locator, previous: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (Number(await input.inputValue()) !== previous) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for Position X to change from ${previous}.`);
}

async function readDefaultSceneFromEditor(page: Page): Promise<{ entities: string[] } | undefined> {
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

async function assertModalPlaceholderState(page: Page): Promise<void> {
  await page.locator(".tn-editor-action-icons__add").click();
  const addObjectDialog = page.getByRole("dialog", { name: "Add Object" });
  await addObjectDialog.waitFor({ timeout: 10_000 });
  const terrain = addObjectDialog.getByRole("button", { name: "Terrain" });
  const model = addObjectDialog.getByRole("button", { exact: true, name: "model.base_basic" });
  if (!(await terrain.isDisabled())) {
    throw new Error("Add Object exposed unsupported Terrain as enabled.");
  }
  if (await model.isDisabled()) {
    throw new Error("Add Object did not enable project model asset actions.");
  }
  if ((await terrain.getAttribute("title"))?.includes("not promoted") !== true) {
    throw new Error("Terrain Add Object action did not expose a disabled reason.");
  }
  if ((await model.getAttribute("title")) !== "assets/models/base_basic_shaded/base_basic_shaded.glb") {
    throw new Error("Custom GLB model action did not expose its project asset path.");
  }
  await page.getByRole("button", { name: "Close Add Object" }).click();

  await page.locator('.tn-editor-action-icons button[title="Delete"]').click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete" });
  await deleteDialog.waitFor({ timeout: 10_000 });
  await deleteDialog.getByText("Delete requires a promoted source operation before it is enabled.").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Close Delete" }).click();

  await page.locator('.tn-editor-action-icons button[title="Settings"]').click();
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

async function addObjectThroughModal(page: Page, buttonName: string, entityPrefix: string): Promise<string> {
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

async function readEditorEntityIds(page: Page, entityPrefix: string): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ id: string }> };
    return payload.sceneObjects?.map((object) => object.id).filter((id) => id.startsWith(prefix)) ?? [];
  }, entityPrefix);
}

async function readNewEditorEntityId(page: Page, entityPrefix: string, before: readonly string[]): Promise<string> {
  await page.waitForFunction(async ({ existing, prefix }) => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ id: string }> };
    return payload.sceneObjects?.some((object) => object.id.startsWith(prefix) && !existing.includes(object.id)) ?? false;
  }, { existing: before, prefix: entityPrefix }, { timeout: 30_000 });
  const ids = await readEditorEntityIds(page, entityPrefix);
  const entityId = ids.find((id) => !before.includes(id));
  if (entityId === undefined) {
    throw new Error(`Added editor entity with prefix ${entityPrefix} was not visible in the project API.`);
  }
  return entityId;
}

async function assertEditedProjectEvidence(
  projectPath: string,
  entityIds: { cameraEntityId: string; emptyEntityId: string; entityId: string; lightEntityId: string; modelEntityId: string },
): Promise<{ assets: IAssetsManifestDocument; environment: IEnvironmentSceneDocument; scene: ISceneDocument; world: IWorldDocument }> {
  const scene = JSON.parse(await readFile(join(projectPath, "content/scenes/arena.scene.json"), "utf8")) as ISceneDocument;
  const world = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/world.ir.json"), "utf8")) as IWorldDocument;
  const materials = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/materials.ir.json"), "utf8")) as IMaterialsDocument;
  const environment = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/environment.scene.json"), "utf8")) as IEnvironmentSceneDocument;
  const assets = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/assets.manifest.json"), "utf8")) as IAssetsManifestDocument;
  const { cameraEntityId, emptyEntityId, entityId, lightEntityId, modelEntityId } = entityIds;
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
  const irCamera = world.entities.find((candidate) => candidate.id === cameraEntityId);
  if (irCamera !== undefined && irCamera.components?.Camera?.kind !== "perspective") {
    throw new Error(`World IR emitted unexpected camera component for ${cameraEntityId}: ${JSON.stringify(irCamera)}`);
  }
  const irLight = world.entities.find((candidate) => candidate.id === lightEntityId);
  if (irLight !== undefined && (irLight.components?.Light?.kind !== "directional" || irLight.components.Light.intensity !== 1)) {
    throw new Error(`World IR emitted unexpected Light component for ${lightEntityId}: ${JSON.stringify(irLight)}`);
  }
  if (environment.terrain?.id !== "terrain.editor" || environment.path?.id !== "path.main") {
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

function findOpenPort(): Promise<number> {
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

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runEditorPackageGate();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}
