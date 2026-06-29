import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { stopProcess, type VerificationReport } from "./runner.js";
import {
  addObjectThroughModal,
  assertAddComponentDefaultPersistence,
  assertAddComponentModal,
  assertEditedProjectEvidence,
  assertGizmoModeControls,
  assertModalPlaceholderState,
  assertProjectAssetRoute,
  assertTypedInspectorControls,
  assertViewportTransformSync,
  assertViewportVisualCueSelections,
  captureCleanVisualState,
  createEditorE2eFixture,
  findOpenPort,
  readBodyText,
  readDefaultSceneFromEditor,
  readProjectInventory,
  waitForEditorModel,
  waitForHttp,
  waitForViewportCanvas,
} from "./editorPackageHelpers.js";

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
  server.unref();
  const startedAt = new Date().toISOString();
  const steps = [];
  const diagnostics = [];
  const lifecycleEvents: string[] = [];
  let ok = false;
  let phase = "starting editor package gate";
  try {
    const browser = await chromium.launch();
    browser.on("disconnected", () => {
      lifecycleEvents.push(`browser disconnected during ${phase}`);
    });
    try {
      phase = "opening editor shell";
      const page = await browser.newPage({ viewport: { height: 924, width: 1913 } });
      const consoleErrors: string[] = [];
      page.on("close", () => {
        lifecycleEvents.push(`page closed during ${phase}`);
      });
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      page.on("crash", () => {
        lifecycleEvents.push(`page crashed during ${phase}`);
      });
      page.on("pageerror", (error) => {
        lifecycleEvents.push(`page error during ${phase}: ${error.message}`);
      });
      await waitForHttp(url, 30_000);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
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
      phase = "selecting base model from hierarchy";
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
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.getByText("base_basic_shaded 0").first().waitFor({ timeout: 10_000 });
      const { bounds: canvasBounds, canvas } = await waitForViewportCanvas(page, "Editor viewport canvas did not render.");
      await canvas.click({ position: { x: canvasBounds.width * 0.5, y: canvasBounds.height * 0.55 } });
      const selectedFromViewport = await page.getByLabel("Name").inputValue();
      if (selectedFromViewport !== "Terrain 0" && selectedFromViewport !== "base_basic_shaded 0" && selectedFromViewport !== "component-target") {
        throw new Error(`Viewport click did not select an expected scene object; inspector ID is '${selectedFromViewport}'.`);
      }
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await assertViewportTransformSync(page);
      await assertGizmoModeControls(page);
      await page.screenshot({ path: artifacts.smokeScreenshot, fullPage: true });

      phase = "checking Add Object modal placeholders";
      await assertModalPlaceholderState(page);
      phase = "adding terrain";
      const terrainEntityId = await addObjectThroughModal(page, "Terrain", "editor-terrain-");
      phase = "adding primitive sphere";
      const entityId = await addObjectThroughModal(page, "Primitive Sphere", "editor-box-");
      phase = "adding empty entity";
      const emptyEntityId = await addObjectThroughModal(page, "Empty Entity", "editor-entity-");
      phase = "adding camera";
      const cameraEntityId = await addObjectThroughModal(page, "Camera", "editor-camera-");
      phase = "adding light";
      const lightEntityId = await addObjectThroughModal(page, "Light", "editor-light-");
      phase = "adding project model";
      const modelEntityId = await addObjectThroughModal(page, "model.base_basic", "editor-model-");

      phase = "building preview";
      await page.getByRole("button", { name: "Build preview" }).click();
      const buildDialog = page.getByRole("dialog", { name: "Build Preview" });
      await buildDialog.waitFor({ timeout: 10_000 });
      await buildDialog.getByRole("button", { exact: true, name: "Build" }).click();
      const buildMessage = page.getByText(/Built |Build failed:/).last();
      await buildMessage.waitFor({ timeout: 120_000 });
      const buildStatus = await buildMessage.textContent() ?? "";
      if (!buildStatus.includes("Built ")) {
        throw new Error(`Preview build did not complete successfully: ${buildStatus || await readBodyText(page)}`);
      }
      await page.getByRole("button", { name: /base_basic_shaded 0 entity/ }).click();
      await assertAddComponentModal(page);

      phase = "asserting persisted source and bundle evidence";
      const evidence = await assertEditedProjectEvidence(fixture.projectPath, { cameraEntityId, emptyEntityId, entityId, lightEntityId, modelEntityId, terrainEntityId });
      await writeFile(artifacts.sourceScene, `${JSON.stringify(evidence.scene, null, 2)}\n`);
      await writeFile(artifacts.worldIr, `${JSON.stringify(evidence.world, null, 2)}\n`);
      await writeFile(artifacts.environmentScene, `${JSON.stringify(evidence.environment, null, 2)}\n`);
      await writeFile(artifacts.assetsManifest, `${JSON.stringify(evidence.assets, null, 2)}\n`);
      phase = "creating new scene";
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
      phase = "capturing final clean visual state";
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
        stdout: `Editor shell rendered, project inventory loaded, added ${entityId}/${emptyEntityId}/${cameraEntityId}/${lightEntityId}/${terrainEntityId}/${modelEntityId}, built preview, and persisted source/IR/environment/assets evidence.`,
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    diagnostics.push({
      code: "TN_VERIFY_EDITOR_PACKAGE_E2E_FAILED",
      message: `${phase}: ${error instanceof Error ? error.message : String(error)}; lifecycle=${lifecycleEvents.join(" | ") || "<none>"}`,
      severity: "error" as const,
      suggestedFix: "Run pnpm --filter @threenative/editor dev and inspect the browser console.",
    });
    steps.push({ durationMs: 0, exitCode: 1, name: "editor-e2e", stderr: `${phase}: ${String(error)}; lifecycle=${lifecycleEvents.join(" | ") || "<none>"}`, stdout: "" });
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runEditorPackageGate();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}
