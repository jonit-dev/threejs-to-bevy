import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildProject } from "@threenative/compiler";

import { applyEditorChatApi, planEditorChatApi } from "./chatApi.js";
import type { IEditorChatOperationStep } from "./chatPlan.js";

test("should apply an approved chat plan through editor operations", async () => {
  const root = await copyStarterProject();
  try {
    const plan = await planEditorChatApi({ projectPath: root, request: { message: "add a dynamic physics cube in front of the camera" } });
    const result = await applyEditorChatApi({ projectPath: root, request: { approvalToken: plan.approvalToken, plan } });

    assert.equal(result.ok, true);
    assert.match(plan.batchPlan?.planHash ?? "", /^sha256:/);
    assert.deepEqual(plan.batchPlan?.touchedPaths, ["content/scenes/arena.scene.json"]);
    assert.equal(plan.batchPlan?.files[0]?.owner, "source");
    assert.equal(result.batchResult?.planHash, plan.batchPlan?.planHash);
    assert.equal(result.batchResult?.committed, true);
    assert.equal(result.changedSourceFiles.includes("content/scenes/arena.scene.json"), true);
    assert.equal(result.liveUpdate.kind, "hotPatch");
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
    };
    const entity = scene.entities.find((item) => item.id === "chat-cube");
    assert.ok(entity);
    assert.deepEqual(entity.transform?.position, [0, 0.5, -2]);
    assert.equal((entity.components?.RigidBody as { kind?: string } | undefined)?.kind, "dynamic");
    assert.equal((entity.components?.Collider as { kind?: string } | undefined)?.kind, "box");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("editor refuses apply after previewed source changes", async () => {
  const root = await copyStarterProject();
  try {
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const plan = await planEditorChatApi({ projectPath: root, request: { message: "add a cube" } });
    const changedAfterPreview = `${await readFile(scenePath, "utf8")}\n`;
    await writeFile(scenePath, changedAfterPreview, "utf8");

    const result = await applyEditorChatApi({ projectPath: root, request: { approvalToken: plan.approvalToken, plan } });

    assert.equal(result.ok, false);
    assert.equal(result.batchResult?.committed, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_BATCH_CONFLICT"), true);
    assert.equal(await readFile(scenePath, "utf8"), changedAfterPreview);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unapproved chat apply requests", async () => {
  const root = await copyStarterProject();
  try {
    const before = await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8");
    const plan = await planEditorChatApi({ projectPath: root, request: { message: "add a cube" } });
    const result = await applyEditorChatApi({ projectPath: root, request: { approvalToken: "wrong", plan } });
    const after = await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8");

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_EDITOR_CHAT_APPROVAL_REQUIRED");
    assert.equal(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should stop chat batch application after first failed operation", async () => {
  const root = await copyStarterProject();
  try {
    const plan = await planEditorChatApi({ projectPath: root, request: { message: "add a cube" } });
    const first = requiredStep(plan.operations[0]);
    const second = requiredStep(plan.operations[1]);
    const brokenPlan = {
      ...plan,
      operations: [
        { ...first, args: { ...first.args, sceneId: "" } },
        { ...second, args: { ...second.args, entityId: "chat-should-not-exist" } },
      ],
    };
    const result = await applyEditorChatApi({ projectPath: root, request: { approvalToken: brokenPlan.approvalToken, plan: brokenPlan } });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as { entities: Array<{ id: string }> };

    assert.equal(result.ok, false);
    assert.equal(result.operationResults.length, 1);
    assert.equal(scene.entities.some((entity) => entity.id === "chat-should-not-exist"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject generated path operations from chat", async () => {
  const root = await copyStarterProject();
  try {
    const plan = await planEditorChatApi({ projectPath: root, request: { message: "add a cube" } });
    const first = requiredStep(plan.operations[0]);
    const unsafePlan = {
      ...plan,
      operations: [{ ...first, args: { ...first.args, prefabId: "dist/world.ir.json" } }],
    };
    const result = await applyEditorChatApi({ projectPath: root, request: { approvalToken: unsafePlan.approvalToken, plan: unsafePlan } });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_EDITOR_CHAT_PATH_REJECTED");
    assert.equal(result.operationResults.length, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should not edit emitted IR files during chat apply", async () => {
  const root = await copyStarterProject();
  try {
    const worldPath = join(root, "dist", "structured-source-starter.bundle", "world.ir.json");
    const beforeApply = await readFile(worldPath, "utf8");
    const plan = await planEditorChatApi({ projectPath: root, request: { message: "add a cube in front" } });
    const result = await applyEditorChatApi({ projectPath: root, request: { approvalToken: plan.approvalToken, plan } });
    const afterApply = await readFile(worldPath, "utf8");

    assert.equal(result.ok, true);
    assert.equal(afterApply, beforeApply);
    const build = await buildProject(root);
    const afterBuild = await readFile(join(build.bundlePath, "world.ir.json"), "utf8");
    assert.notEqual(afterBuild, beforeApply);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function copyStarterProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-chat-api-"));
  await mkdir(root, { recursive: true });
  await cp(resolve("../../templates/structured-source-starter"), root, { recursive: true });
  return root;
}

function requiredStep(step: IEditorChatOperationStep | undefined): IEditorChatOperationStep {
  assert.ok(step);
  return step;
}
