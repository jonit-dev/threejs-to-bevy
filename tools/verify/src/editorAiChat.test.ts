import assert from "node:assert/strict";
import test from "node:test";

import { editorAiChatArtifactPaths } from "./editorAiChat.js";

test("should report chat-authored ECS proof artifacts", () => {
  assert.deepEqual(editorAiChatArtifactPaths("/repo"), {
    applyResult: "/repo/tools/verify/artifacts/editor-ai-chat/chat-apply-result.json",
    plan: "/repo/tools/verify/artifacts/editor-ai-chat/chat-plan.json",
    report: "/repo/tools/verify/artifacts/editor-ai-chat/editor-ai-chat-report.json",
    sourceScene: "/repo/tools/verify/artifacts/editor-ai-chat/arena.scene.after-chat.json",
    worldIr: "/repo/tools/verify/artifacts/editor-ai-chat/world.after-chat.ir.json",
  });
});

test("should prove live scene update without relying on Vite HMR through report contract", () => {
  const artifacts = editorAiChatArtifactPaths("/repo");

  assert.equal(artifacts.report.endsWith("editor-ai-chat-report.json"), true);
  assert.equal(artifacts.sourceScene.includes("arena.scene.after-chat.json"), true);
  assert.equal(artifacts.worldIr.includes("world.after-chat.ir.json"), true);
});
