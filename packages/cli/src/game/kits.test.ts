import assert from "node:assert/strict";
import test from "node:test";

import { listGameKitManifests, matchGameKitCandidates, validateGameKitManifest, type IGameKitManifest } from "./kits.js";

test("validates kit manifest shape", () => {
  const [valid] = listGameKitManifests();
  assert.ok(valid);
  const [firstBlock] = valid.blocks;
  assert.ok(firstBlock);
  assert.deepEqual(validateGameKitManifest(valid), []);

  const invalid: IGameKitManifest = {
    ...valid,
    blocks: [
      {
        ...firstBlock,
        id: "",
        proofCommands: [],
        sourceOwners: {},
      },
    ],
  };

  const diagnostics = validateGameKitManifest(invalid);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_KIT_BLOCK_INVALID" && diagnostic.path === "/blocks/0/id"), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_KIT_BLOCK_INVALID" && diagnostic.path === "/blocks/0/sourceOwners"), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_KIT_BLOCK_INVALID" && diagnostic.path === "/blocks/0/proofCommands"), true);
});

test("matches kit candidates by goal while preserving all promoted kits", () => {
  const candidates = matchGameKitCandidates("fast lane runner with traffic hazards");

  assert.equal(candidates.length >= 3, true);
  assert.equal(candidates[0]?.kitId, "lane-runner");
  assert.equal(candidates.every((candidate) => candidate.mutate === false && candidate.toolingOnly === true), true);
  assert.equal(candidates.some((candidate) => candidate.kitId === "top-down-collector"), true);
  assert.equal(candidates.some((candidate) => candidate.kitId === "checkpoint-race"), true);
  assert.equal(candidates[0]?.blocks.some((block) => block.id === "controller.lane-runner"), true);
});
