import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium, type Page } from "playwright";

import { stopProcess, type VerificationReport } from "./runner.js";

export interface IEditorPackageArtifacts extends Record<string, unknown> {
  editedScreenshot: string;
  report: string;
  sourceScene: string;
  smokeScreenshot: string;
  worldIr: string;
}

export function editorPackageArtifactPaths(root = process.cwd()): IEditorPackageArtifacts {
  const artifactRoot = resolve(root, "tools/verify/artifacts/editor-package");
  return {
    editedScreenshot: resolve(artifactRoot, "editor-package-edited.png"),
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
      await assertProjectAssetRoute(page, "assets/models/GreenTree/glb/green_tree_basic_shaded.glb");
      await waitForEditorModel(page, "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb");
      await waitForEditorModel(page, "assets/models/GreenTree/glb/green_tree_basic_shaded.glb");
      const inventory = await readProjectInventory(page);
      if (!inventory.paths.includes("content/scenes/arena.scene.json") || !inventory.paths.includes("content/materials/arena.materials.json")) {
        throw new Error(`Editor project inventory did not include expected source documents: ${inventory.paths.join(", ")}`);
      }
      await page.getByText("LOD:").waitFor({ timeout: 10_000 });
      await page.getByText(/Triangles:/).waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await page.getByLabel("Name").waitFor({ timeout: 10_000 });
      if ((await page.getByLabel("Name").inputValue()) !== "base_basic_shaded 0") {
        throw new Error("Inspector did not update after selecting base_basic_shaded 0 in the hierarchy.");
      }
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
      if (selectedFromViewport !== "Terrain 0" && selectedFromViewport !== "base_basic_shaded 0") {
        throw new Error(`Viewport click did not select an expected scene object; inspector ID is '${selectedFromViewport}'.`);
      }
      await page.screenshot({ path: artifacts.smokeScreenshot, fullPage: true });

      await page.locator(".tn-editor-action-icons__add").click();
      const addObjectDialog = page.getByRole("dialog", { name: "Add Object" });
      await addObjectDialog.waitFor({ timeout: 10_000 });
      await addObjectDialog.getByRole("button", { name: "Primitive Sphere" }).click();
      const entityId = await readAddedEntityIdFromEditor(page);

      await page.getByRole("button", { name: "Build preview" }).click();
      const buildDialog = page.getByRole("dialog", { name: "Build Preview" });
      await buildDialog.waitFor({ timeout: 10_000 });
      await buildDialog.getByRole("button", { exact: true, name: "Build" }).click();
      await page.getByText(/Built /).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await page.screenshot({ path: artifacts.editedScreenshot, fullPage: true });

      const evidence = await assertEditedProjectEvidence(fixture.projectPath, entityId);
      await writeFile(artifacts.sourceScene, `${JSON.stringify(evidence.scene, null, 2)}\n`);
      await writeFile(artifacts.worldIr, `${JSON.stringify(evidence.world, null, 2)}\n`);
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
        stdout: `Editor shell rendered, project inventory loaded, added ${entityId}, built preview, and persisted source/IR evidence.`,
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
  prefabs: Array<{ color?: string; id: string; primitive?: string }>;
  resources?: unknown[];
  schema?: string;
  systems?: unknown[];
  ui?: unknown;
  version?: string;
}

interface IWorldDocument {
  entities: Array<{
    components?: {
      MeshRenderer?: { material?: string; mesh?: string };
      Transform?: { position?: number[] };
    };
    id: string;
  }>;
}

interface IMaterialsDocument {
  materials: Array<{ color?: string; id: string }>;
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
        components: { camera: { mode: "perspective" } },
        id: "main-camera",
        transform: { position: [2.8, 2.8, 1.1] },
      },
      {
        components: { Light: { kind: "directional" } },
        id: "directional-light",
        transform: { position: [-2, 3, 2] },
      },
      {
        components: { Light: { kind: "ambient" } },
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
        transform: { position: [4.6, 0, -2.1], rotation: [0, -0.45, 0], scale: [1, 1, 1] },
      },
      {
        id: "base-basic-shaded-0",
        prefab: "prefab.base-basic-shaded-0",
        transform: { position: [-0.7, 0, 0.2], scale: [1, 1, 1] },
      },
    ],
    prefabs: [
      { color: "#075d18", id: "prefab.terrain-0", primitive: "plane" },
      { asset: "assets/models/FarmHouse/glb/farm_house_basic_shaded.glb", color: "#9c3a16", id: "prefab.farm-house-basic-shaded-0", primitive: "box" },
      { asset: "assets/models/GreenTree/glb/green_tree_basic_shaded.glb", color: "#66a80f", id: "prefab.base-basic-shaded-0", primitive: "sphere" },
    ],
    id: "arena",
    resources: [],
    schema: "threenative.scene",
    systems: [],
    ui: { nodes: [] },
    version: "0.1.0",
  } as ISceneDocument;
  await writeFile(join(projectPath, "content", "scenes", "arena.scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
}

async function copyEditorModelAssets(projectPath: string): Promise<void> {
  const sourceRoot = "/home/joao/projects/vibe-coder-3d/public/assets/models";
  await mkdir(join(projectPath, "assets", "models", "FarmHouse", "glb"), { recursive: true });
  await mkdir(join(projectPath, "assets", "models", "GreenTree", "glb"), { recursive: true });
  await cp(join(sourceRoot, "FarmHouse", "glb", "farm_house_basic_shaded.glb"), join(projectPath, "assets", "models", "FarmHouse", "glb", "farm_house_basic_shaded.glb"));
  await cp(join(sourceRoot, "GreenTree", "glb", "green_tree_basic_shaded.glb"), join(projectPath, "assets", "models", "GreenTree", "glb", "green_tree_basic_shaded.glb"));
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

async function readAddedEntityIdFromEditor(page: Page): Promise<string> {
  await page.waitForFunction(async () => {
    const response = await fetch("/api/project");
    const payload = (await response.json()) as { sceneObjects?: Array<{ id: string }> };
    return payload.sceneObjects?.some((object) => object.id.startsWith("editor-box-")) ?? false;
  }, undefined, { timeout: 30_000 });
  return page.evaluate(() => {
    return fetch("/api/project")
      .then((response) => response.json())
      .then((payload: unknown) => {
        const sceneObjects = typeof payload === "object" && payload !== null && "sceneObjects" in payload && Array.isArray(payload.sceneObjects)
          ? payload.sceneObjects
          : [];
        const entity = sceneObjects.find((object): object is { id: string } => typeof object === "object" && object !== null && "id" in object && typeof object.id === "string" && object.id.startsWith("editor-box-"));
        if (entity === undefined) {
          throw new Error("Added editor primitive was not visible in the project API.");
        }
        return entity.id;
      });
  });
}

async function assertEditedProjectEvidence(projectPath: string, entityId: string): Promise<{ scene: ISceneDocument; world: IWorldDocument }> {
  const scene = JSON.parse(await readFile(join(projectPath, "content/scenes/arena.scene.json"), "utf8")) as ISceneDocument;
  const world = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/world.ir.json"), "utf8")) as IWorldDocument;
  const materials = JSON.parse(await readFile(join(projectPath, "dist/structured-source-starter.bundle/materials.ir.json"), "utf8")) as IMaterialsDocument;
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
  return { scene, world };
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
