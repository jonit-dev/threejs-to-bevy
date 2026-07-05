import assert from "node:assert/strict";
import test from "node:test";

import { CheckpointRaceKit } from "./index.js";

test("checkpoint race reducer advances checkpoints and finishes laps", () => {
  const checkpoints = [[0, 0, 0], [10, 0, 0]] as const;
  const start = CheckpointRaceKit.initial();
  const first = CheckpointRaceKit.passCheckpoint(start, [0.5, 0, 0], checkpoints, { lapsToFinish: 1, radius: 1 });
  const second = CheckpointRaceKit.passCheckpoint(first, [10, 0, 0], checkpoints, { lapsToFinish: 1, radius: 1 });

  assert.equal(first.reached, true);
  assert.equal(first.checkpoint, 1);
  assert.equal(second.lap, 1);
  assert.equal(second.status, "finished");
});

test("checkpoint race reducer records missed checkpoints and time", () => {
  const missed = CheckpointRaceKit.missCheckpoint(CheckpointRaceKit.initial());
  const ticked = CheckpointRaceKit.tick(missed, 2.5);

  assert.equal(missed.missed, 1);
  assert.equal(ticked.timeSeconds, 2.5);
});
