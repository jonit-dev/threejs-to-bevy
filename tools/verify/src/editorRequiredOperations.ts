import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface IEditorRequiredOperationsReport {
  bundlePath: string;
  changedFiles: string[];
  finalEntityCount: number;
  initialEntityCount: number;
  ok: boolean;
  projectPath?: string;
  schema: "threenative.editor-required-operations-smoke";
}

export interface IRunEditorRequiredOperationsOptions {
  keep?: boolean;
  root?: string;
  skipPackageBuild?: boolean;
}

interface IOperationResult {
  diagnostics: unknown[];
  ok: boolean;
  projectRevision: string;
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

interface ISystemsDocument {
  systems?: Array<{
    id: string;
    script?: { export?: string; module?: string };
  }>;
}

export async function runEditorRequiredOperationsSmoke(options: IRunEditorRequiredOperationsOptions = {}): Promise<IEditorRequiredOperationsReport> {
  const root = options.root ?? process.cwd();
  const keep = options.keep ?? false;
  const tempRoot = await mkdtemp(join(tmpdir(), "tn-editor-ops-"));
  const projectPath = join(tempRoot, "project");

  try {
    if (options.skipPackageBuild !== true) {
      run("pnpm", ["--filter", "@threenative/authoring", "build"], root);
      run("pnpm", ["--filter", "@threenative/compiler", "build"], root);
      run("pnpm", ["--filter", "@threenative/editor", "build"], root);
    }

    const { applyEditorOperationApi } = await import("../../../packages/editor/dist/server/operationApi.js") as {
      applyEditorOperationApi(options: {
        projectPath: string;
        request: { args: Record<string, unknown>; name: string; projectRevision?: string };
        rootPath?: string;
      }): Promise<IOperationResult>;
    };
    const { buildProject, validateBundle } = await import("../../../packages/compiler/dist/index.js") as {
      buildProject(projectPath: string): Promise<{ bundlePath: string }>;
      validateBundle(bundlePath: string): Promise<{ diagnostics: unknown[]; ok: boolean }>;
    };

    await cp(resolve(root, "templates/structured-source-starter"), projectPath, { recursive: true });
    const initialBuild = await buildProject(projectPath);
    const initialWorld = await readJson<IWorldDocument>(join(initialBuild.bundlePath, "world.ir.json"));
    let revision = "editor-required-ops";

    const apply = async (name: string, args: Record<string, unknown>): Promise<void> => {
      const result = await applyEditorOperationApi({
        projectPath,
        request: { args, name, projectRevision: revision },
        rootPath: tempRoot,
      });
      revision = result.projectRevision;
      if (!result.ok) {
        throw new Error(`${name} failed: ${JSON.stringify(result.diagnostics, null, 2)}`);
      }
    };

    await mkdir(join(projectPath, "src", "scripts"), { recursive: true });
    await writeFile(
      join(projectPath, "src", "scripts", "editor-spin.ts"),
      ["export function editorSpin() {", "  return undefined;", "}", ""].join("\n"),
    );

    await apply("scene.create_default", {
      file: "content/scenes/editor-created.scene.json",
      sceneId: "editor-created",
    });
    await apply("mesh.create_primitive", {
      kind: "sphere",
      meshId: "mesh.editor_sphere",
    });
    await apply("scene.add_prefab", {
      color: "#31c48d",
      prefabId: "prefab.editor_sphere",
      primitive: "sphere",
      sceneId: "arena",
    });
    await apply("scene.add_entity", {
      entityId: "editor.sphere.0",
      prefabId: "prefab.editor_sphere",
      sceneId: "arena",
    });
    await apply("scene.set_transform", {
      entityId: "editor.sphere.0",
      position: [2.5, 0.75, -1.25],
      rotation: [0, 0.35, 0],
      scale: [0.7, 0.7, 0.7],
      sceneId: "arena",
    });
    await apply("scene.set_component", {
      componentKind: "EditorSmoke",
      entityId: "editor.sphere.0",
      sceneId: "arena",
      value: { enabled: true, label: "editor-operation-smoke" },
    });
    await apply("scene.set_rigid_body", {
      entityId: "editor.sphere.0",
      kind: "dynamic",
      mass: 1,
      sceneId: "arena",
    });
    await apply("scene.set_collider", {
      entityId: "editor.sphere.0",
      kind: "box",
      sceneId: "arena",
      size: [1, 1, 1],
    });
    await apply("system.create", {
      schedule: "update",
      systemId: "editor-spin",
    });
    await apply("system.attach_script", {
      exportName: "editorSpin",
      modulePath: "src/scripts/editor-spin.ts",
      systemId: "editor-spin",
    });

    const finalBuild = await buildProject(projectPath);
    const validation = await validateBundle(finalBuild.bundlePath);
    if (!validation.ok) {
      throw new Error(`Final bundle validation failed: ${JSON.stringify(validation.diagnostics, null, 2)}`);
    }

    const scene = await readJson<ISceneDocument>(join(projectPath, "content", "scenes", "arena.scene.json"));
    const createdScene = await readJson<ISceneDocument>(join(projectPath, "content", "scenes", "editor-created.scene.json"));
    const systems = await readJson<ISystemsDocument>(join(projectPath, "content", "systems", "editor-spin.systems.json"));
    const finalWorld = await readJson<IWorldDocument>(join(finalBuild.bundlePath, "world.ir.json"));

    const sourceEntity = scene.entities?.find((entity) => entity.id === "editor.sphere.0");
    assert(sourceEntity?.prefab === "prefab.editor_sphere", "source scene did not persist the added entity prefab reference");
    assert(
      JSON.stringify(sourceEntity?.transform?.position) === JSON.stringify([2.5, 0.75, -1.25]),
      "source scene did not persist the moved entity transform",
    );
    assert(sourceEntity?.components?.EditorSmoke?.label === "editor-operation-smoke", "source scene did not persist the attached custom component");
    assert(sourceEntity?.components?.RigidBody?.kind === "dynamic", "source scene did not persist the editor-authored rigid body");
    assert(sourceEntity?.components?.Collider?.kind === "box", "source scene did not persist the editor-authored collider");
    assert(createdScene.entities?.some((entity) => entity.id === "main-camera"), "default scene creation did not seed a main camera");
    assert(
      systems.systems?.some((system) => system.id === "editor-spin" && system.script?.module === "src/scripts/editor-spin.ts" && system.script?.export === "editorSpin"),
      "system script reference was not attached",
    );

    const initialEntityIds = new Set((initialWorld.entities ?? []).map((entity) => entity.id));
    const finalEntity = (finalWorld.entities ?? []).find((entity) => entity.id === "editor.sphere.0");
    assert(!initialEntityIds.has("editor.sphere.0"), "initial IR unexpectedly already contained editor.sphere.0");
    assert(finalEntity !== undefined, "final IR did not include the editor-added entity");
    assert(
      JSON.stringify(finalEntity.components?.Transform?.position) === JSON.stringify([2.5, 0.75, -1.25]),
      "final IR did not reflect the moved entity transform",
    );
    assert(finalEntity.components?.RigidBody?.kind === "dynamic", "final IR did not include the editor-authored rigid body");
    assert(finalEntity.components?.RigidBody?.mass === 1, "final IR did not include the editor-authored rigid body mass");
    assert(finalEntity.components?.Collider?.kind === "box", "final IR did not include the editor-authored collider");
    assert(
      JSON.stringify(finalEntity.components?.Collider?.size) === JSON.stringify([1, 1, 1]),
      "final IR did not include the editor-authored collider size",
    );

    return {
      bundlePath: finalBuild.bundlePath,
      changedFiles: [
        "content/scenes/arena.scene.json",
        "content/scenes/editor-created.scene.json",
        "content/meshes/mesh.editor_sphere.meshes.json",
        "content/systems/editor-spin.systems.json",
        "src/scripts/editor-spin.ts",
      ],
      finalEntityCount: finalWorld.entities?.length ?? 0,
      initialEntityCount: initialWorld.entities?.length ?? 0,
      ok: true,
      projectPath: keep ? projectPath : undefined,
      schema: "threenative.editor-required-operations-smoke",
    };
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
