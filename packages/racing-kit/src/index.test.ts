import assert from "node:assert/strict";
import test from "node:test";

import { CheckpointRace, Track2D } from "./index.js";

test("should sample loop tracks deterministically", () => {
  const track = Track2D.loop({
    points: [
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
      [0, 0, 10],
    ],
    width: 4,
  });

  assert.deepEqual(track.pointAtPhase(0), [0, 0, 0]);
  assert.deepEqual(track.pointAtPhase(0.25), [10, 0, 0]);
  assert.deepEqual(track.pointAtPhase(0.625), [5, 0, 10]);
  assert.deepEqual(track.pointAtPhase(1.25), [10, 0, 0]);
});

test("should detect off-track positions", () => {
  const track = Track2D.loop({
    points: [
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
      [0, 0, 10],
    ],
    width: 4,
  });

  assert.equal(track.contains2d([5, 0, 1.9]), true);
  assert.equal(track.contains2d([5, 0, 3.1]), false);
});

test("should advance checkpoint races deterministically", () => {
  const checkpoints = [
    [0, 0, 0],
    [10, 0, 0],
  ] as const;

  assert.deepEqual(CheckpointRace.advance({ checkpoint: 0, lap: 0 }, [0.5, 0, 0], checkpoints, { radius: 1 }), {
    checkpoint: 1,
    completed: false,
    lap: 0,
    message: "Checkpoint 2/2",
  });
  assert.deepEqual(CheckpointRace.advance({ checkpoint: 1, lap: 0 }, [10, 0, 0], checkpoints, { radius: 1 }), {
    checkpoint: 0,
    completed: true,
    lap: 1,
    message: "Lap 1",
  });
  assert.equal(CheckpointRace.hud({ checkpoint: 1, lap: 1, message: "Checkpoint 2/2", speed: 73.6 }), "Lap 1 | Checkpoint 2/2 | 74 km/h");
});
