import test from "node:test";
import assert from "node:assert/strict";

import { loadCookbookEntries } from "../commands/cookbook.js";
import { isGameplayBlockReference } from "../commands/game.js";
import { bestCookbookMatch, matchCookbookEntries, matchCookbookEntryForBlock } from "./match.js";

test("should rank keyword and id hits above goal-only hits", async () => {
  const entries = await loadCookbookEntries(process.cwd());
  const matches = matchCookbookEntries("coin pickup respawn", entries);
  assert.equal(matches[0]?.entry.id, "collectible-respawn");
});

test("should return every entry within top three for its own goal text", async () => {
  const entries = await loadCookbookEntries(process.cwd());
  assert.equal(entries.length > 0, true);
  for (const entry of entries) {
    const top = matchCookbookEntries(entry.goal, entries).slice(0, 3).map((match) => match.entry.id);
    assert.equal(top.includes(entry.id), true, `entry '${entry.id}' is not reachable from its own goal: got ${top.join(", ")}`);
  }
});

test("should preserve goal-map parity for previously hardcoded goals", async () => {
  const entries = await loadCookbookEntries(process.cwd());
  assert.equal(bestCookbookMatch("race around checkpoints", entries)?.id, "checkpoint-race-progress");
  assert.equal(bestCookbookMatch("knock down targets", entries)?.id, "physics-knockdown");
  assert.equal(bestCookbookMatch("collect coins", entries)?.id, "collectible-respawn");
  assert.equal(bestCookbookMatch("completely unrelated nonsense", entries), undefined);
});

test("should preserve block-map parity for previously hardcoded blocks", async () => {
  const entries = await loadCookbookEntries(process.cwd());
  assert.equal(matchCookbookEntryForBlock("objective.checkpoint-lap", entries)?.id, "checkpoint-race-progress");
  assert.equal(matchCookbookEntryForBlock("controller.top-down-cardinal", entries)?.id, "player-move-wasd");
  assert.equal(matchCookbookEntryForBlock("camera.position-follow", entries)?.id, "follow-camera");
  assert.equal(matchCookbookEntryForBlock("objective.collectible", entries)?.id, "collectible-respawn");
  assert.equal(matchCookbookEntryForBlock("objective.obstacle-avoid", entries)?.id, "kinematic-hazard");
  assert.equal(matchCookbookEntryForBlock("spawn.region-sampler", entries)?.id, "lane-runner-spawn");
  assert.equal(matchCookbookEntryForBlock("unknown.block", entries), undefined);
});

test("should validate blocks frontmatter against gameplay block descriptors", async () => {
  const entries = await loadCookbookEntries(process.cwd());
  assert.equal(isGameplayBlockReference("objective.collectible"), true);
  assert.equal(isGameplayBlockReference("controller.*"), true);
  assert.equal(isGameplayBlockReference("controller.not-a-real-block"), false);
  assert.equal(isGameplayBlockReference("unknown.*"), false);
  for (const entry of entries) {
    for (const block of entry.blocks ?? []) {
      assert.equal(isGameplayBlockReference(block), true, `entry '${entry.id}' declares unknown block '${block}'`);
    }
  }
});
