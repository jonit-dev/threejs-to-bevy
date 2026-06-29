import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface IEditorAiChatArtifacts extends Record<string, unknown> {
  applyResult: string;
  plan: string;
  report: string;
  sourceScene: string;
  worldIr: string;
}

export interface IEditorAiChatReport {
  artifacts: IEditorAiChatArtifacts;
  bundlePath: string;
  changedSourceFiles: string[];
  chatRequest: string;
  finalEntityCount: number;
  generatedProofFiles: string[];
  initialEntityCount: number;
  liveUpdateKind: string;
  ok: boolean;
  operations: string[];
  projectPath?: string;
  schema: "threenative.editor-ai-chat-proof";
}

export interface IRunEditorAiChatOptions {
  keep?: boolean;
  root?: string;
  skipPackageBuild?: boolean;
}

interface IWorldDocument {
  entities?: Array<{
    components?: {
      Collider?: { kind?: string; size?: number[] };
      RigidBody?: { kind?: string; mass?: number };
      Transform?: { position?: number[] };
    };
    id: string;
  }>;
}

interface ISceneDocument {
  entities?: Array<{
    components?: Record<string, Record<string, unknown>>;
    id: string;
    prefab?: string;
    transform?: { position?: number[] };
  }>;
}

const defaultRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export function editorAiChatArtifactPaths(root = process.cwd()): IEditorAiChatArtifacts {
  const artifactRoot = resolve(root, "tools/verify/artifacts/editor-ai-chat");
  return {
    applyResult: resolve(artifactRoot, "chat-apply-result.json"),
    plan: resolve(artifactRoot, "chat-plan.json"),
    report: resolve(artifactRoot, "editor-ai-chat-report.json"),
    sourceScene: resolve(artifactRoot, "arena.scene.after-chat.json"),
    worldIr: resolve(artifactRoot, "world.after-chat.ir.json"),
  };
}

export async function runEditorAiChatGate(options: IRunEditorAiChatOptions = {}): Promise<IEditorAiChatReport> {
  const root = options.root ?? process.cwd();
  const keep = options.keep ?? false;
  const artifacts = editorAiChatArtifactPaths(root);
  const artifactRoot = resolve(root, "tools/verify/artifacts/editor-ai-chat");
  const tempRoot = await mkdtemp(join(tmpdir(), "tn-editor-ai-chat-"));
  const projectPath = join(tempRoot, "project");

  try {
    if (options.skipPackageBuild !== true) {
      run("pnpm", ["--filter", "@threenative/authoring", "build"], root);
      run("pnpm", ["--filter", "@threenative/compiler", "build"], root);
      run("pnpm", ["--filter", "@threenative/editor", "build"], root);
    }

    const editor = await import("../../../packages/editor/dist/index.js") as {
      applyEditorChatApi(options: { projectPath: string; request: { approvalToken?: string; plan?: unknown }; rootPath?: string }): Promise<{
        changedSourceFiles: string[];
        diagnostics: unknown[];
        generatedProofFiles: string[];
        liveUpdate: { affectedEntities: string[]; kind: string };
        ok: boolean;
        projectRevision?: string;
      }>;
      loadEditorProjectApi(options: { projectPath: string; rootPath?: string }): Promise<{
        projectRevision: string;
        sceneObjects: Array<{ id: string; rowId: string }>;
      }>;
      planEditorChatApi(options: { projectPath: string; request: { message: string; selectedRowId?: string }; rootPath?: string }): Promise<{
        approvalToken: string;
        diagnostics: unknown[];
        ok: boolean;
        operations: Array<{ args: Record<string, unknown>; name: string }>;
      }>;
    };
    const { buildProject, validateBundle } = await import("../../../packages/compiler/dist/index.js") as {
      buildProject(projectPath: string): Promise<{ bundlePath: string }>;
      validateBundle(bundlePath: string): Promise<{ diagnostics: unknown[]; ok: boolean }>;
    };

    await mkdir(artifactRoot, { recursive: true });
    await cp(resolve(root, "templates/structured-source-starter"), projectPath, { recursive: true });
    const initialBuild = await buildProject(projectPath);
    const initialWorldText = await readFile(join(initialBuild.bundlePath, "world.ir.json"), "utf8");
    const initialWorld = JSON.parse(initialWorldText) as IWorldDocument;

    const request = "add a dynamic physics cube in front of the camera";
    const plan = await editor.planEditorChatApi({ projectPath, request: { message: request }, rootPath: tempRoot });
    assert(plan.ok, `chat plan failed: ${JSON.stringify(plan.diagnostics, null, 2)}`);
    assert(
      plan.operations.map((operation) => operation.name).join(",") === "scene.add_prefab,scene.add_entity,scene.set_transform,scene.set_rigid_body,scene.set_collider",
      `chat plan did not produce the expected ECS vertical slice: ${plan.operations.map((operation) => operation.name).join(", ")}`,
    );
    await writeFile(artifacts.plan, `${JSON.stringify(plan, null, 2)}\n`);

    const apply = await editor.applyEditorChatApi({ projectPath, request: { approvalToken: plan.approvalToken, plan }, rootPath: tempRoot });
    assert(apply.ok, `chat apply failed: ${JSON.stringify(apply.diagnostics, null, 2)}`);
    assert(apply.liveUpdate.kind === "hotPatch", `chat apply did not produce a hotPatch live update hint: ${apply.liveUpdate.kind}`);
    assert(apply.changedSourceFiles.includes("content/scenes/arena.scene.json"), "chat apply did not report the changed source scene");
    await writeFile(artifacts.applyResult, `${JSON.stringify(apply, null, 2)}\n`);

    const worldAfterApply = await readFile(join(initialBuild.bundlePath, "world.ir.json"), "utf8");
    assert(worldAfterApply === initialWorldText, "chat apply changed emitted world.ir.json before build proof");

    const refreshed = await editor.loadEditorProjectApi({ projectPath, rootPath: tempRoot });
    assert(refreshed.sceneObjects.some((object) => object.id === "chat-cube"), "refreshed editor project did not include chat-cube before a Vite reload");

    const scene = await readJson<ISceneDocument>(join(projectPath, "content", "scenes", "arena.scene.json"));
    const sourceEntity = scene.entities?.find((entity) => entity.id === "chat-cube");
    assert(sourceEntity?.prefab === "prefab.chat-cube", "source scene did not persist chat-cube prefab reference");
    assert(JSON.stringify(sourceEntity?.transform?.position) === JSON.stringify([0, 0.5, -2]), "source scene did not persist chat-cube transform");
    assert(sourceEntity?.components?.RigidBody?.kind === "dynamic", "source scene did not persist chat RigidBody");
    assert(sourceEntity?.components?.Collider?.kind === "box", "source scene did not persist chat Collider");

    const finalBuild = await buildProject(projectPath);
    const validation = await validateBundle(finalBuild.bundlePath);
    assert(validation.ok, `final bundle validation failed: ${JSON.stringify(validation.diagnostics, null, 2)}`);
    const finalWorld = await readJson<IWorldDocument>(join(finalBuild.bundlePath, "world.ir.json"));
    const finalEntity = finalWorld.entities?.find((entity) => entity.id === "chat-cube");
    assert(finalEntity !== undefined, "final IR did not include chat-cube");
    assert(JSON.stringify(finalEntity.components?.Transform?.position) === JSON.stringify([0, 0.5, -2]), "final IR did not reflect chat-cube transform");
    assert(finalEntity.components?.RigidBody?.kind === "dynamic", "final IR did not include chat RigidBody");
    assert(finalEntity.components?.Collider?.kind === "box", "final IR did not include chat Collider");

    await writeFile(artifacts.sourceScene, `${JSON.stringify(scene, null, 2)}\n`);
    await writeFile(artifacts.worldIr, `${JSON.stringify(finalWorld, null, 2)}\n`);

    const report: IEditorAiChatReport = {
      artifacts,
      bundlePath: finalBuild.bundlePath,
      changedSourceFiles: apply.changedSourceFiles,
      chatRequest: request,
      finalEntityCount: finalWorld.entities?.length ?? 0,
      generatedProofFiles: [join(finalBuild.bundlePath, "world.ir.json")],
      initialEntityCount: initialWorld.entities?.length ?? 0,
      liveUpdateKind: apply.liveUpdate.kind,
      ok: true,
      operations: plan.operations.map((operation) => operation.name),
      projectPath: keep ? projectPath : undefined,
      schema: "threenative.editor-ai-chat-proof",
    };
    await writeFile(artifacts.report, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    if (!keep) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keep = process.argv.includes("--keep");
  runEditorAiChatGate({ keep, root: defaultRoot }).then(
    (report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
