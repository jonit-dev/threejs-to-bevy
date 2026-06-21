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
      const page = await browser.newPage({ viewport: { height: 900, width: 1280 } });
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      await waitForHttp(url, 30_000);
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      for (const text of ["ThreeNative Editor", "Hierarchy", "Inspector", "Assets", "Diagnostics", "Preview", "arena.scene.json"]) {
        await page.getByText(text).first().waitFor({ timeout: 10_000 });
      }
      const inventory = await readProjectInventory(page);
      if (!inventory.paths.includes("content/scenes/arena.scene.json") || !inventory.paths.includes("content/materials/arena.materials.json")) {
        throw new Error(`Editor project inventory did not include expected source documents: ${inventory.paths.join(", ")}`);
      }
      await page.screenshot({ path: artifacts.smokeScreenshot, fullPage: true });

      await page.getByLabel("Primitive").selectOption("sphere");
      await page.getByLabel("Color").fill("#9b59b6");
      const operationResponses = Promise.all([
        waitForOkJsonResponse(page, "/api/operation"),
        waitForOkJsonResponse(page, "/api/operation"),
        waitForOkJsonResponse(page, "/api/operation"),
      ]);
      await page.getByRole("button", { name: "Add primitive" }).click();
      await operationResponses;
      await page.getByText(/^Added editor-box-/).waitFor({ timeout: 10_000 });
      const addedStatus = (await page.getByRole("status").textContent()) ?? "";
      const entityId = readAddedEntityId(addedStatus);

      const buildResponse = waitForOkJsonResponse(page, "/api/build");
      await page.getByRole("button", { name: "Build preview" }).click();
      await buildResponse;
      await page.getByText(/^Built /).waitFor({ timeout: 30_000 });
      await page.screenshot({ path: artifacts.editedScreenshot, fullPage: true });

      const evidence = await assertEditedProjectEvidence(fixture.projectPath, entityId);
      await writeFile(artifacts.sourceScene, `${JSON.stringify(evidence.scene, null, 2)}\n`);
      await writeFile(artifacts.worldIr, `${JSON.stringify(evidence.world, null, 2)}\n`);
      if (consoleErrors.length > 0) {
        throw new Error(`Editor browser console reported errors: ${consoleErrors.join(" | ")}`);
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
  entities: Array<{ id: string; prefab?: string; transform?: unknown }>;
  prefabs: Array<{ color?: string; id: string; primitive?: string }>;
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

function readAddedEntityId(status: string): string {
  const match = status.match(/Added (editor-box-[a-z0-9]+); primitive sphere;/);
  if (match?.[1] === undefined) {
    throw new Error(`Could not read added sphere entity from editor status: ${status}`);
  }
  return match[1];
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
  if (irEntity.components.Transform?.position?.join(",") !== "2,0.5,1") {
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
