import test from "node:test";
import assert from "node:assert/strict";
import type { ISequencesIr } from "@threenative/ir";
import { traceSequences } from "./sequences.js";

test("sequence trace should restore camera mode when sequence ends or skipped", () => {
  const sequences: ISequencesIr = {
    schema: "threenative.sequences",
    version: "0.1.0",
    sequences: [
      {
        duration: 1,
        id: "intro",
        skippable: true,
        tracks: [
          {
            entity: "camera.main",
            id: "camera",
            kind: "cameraPose",
            keyframes: [
              { time: 0, value: { position: [0, 2, 4] } },
              { time: 1, value: { position: [0, 4, 0] } },
            ],
          },
        ],
      },
      {
        duration: 1,
        id: "win",
        skippable: true,
        tracks: [
          {
            entity: "camera.main",
            id: "camera",
            kind: "cameraPose",
            keyframes: [
              { time: 0, value: { position: [1, 2, 4] } },
              { time: 1, value: { position: [1, 4, 0] } },
            ],
          },
        ],
      },
    ],
  };

  const trace = traceSequences(sequences, {
    fixedDelta: 0.5,
    playByTick: { 0: ["intro"], 3: ["win"] },
    skipByTick: { 4: ["win"] },
    ticks: 6,
  });

  assert.deepEqual(trace.find((frame) => frame.sequence === "intro" && frame.completed), {
    active: false,
    completed: true,
    observations: [
      {
        entity: "camera.main",
        kind: "cameraPose",
        sequence: "intro",
        tick: 2,
        time: 1,
        track: "camera",
        value: { position: [0, 4, 0] },
      },
    ],
    restoredCamera: "camera.main",
    sequence: "intro",
    tick: 2,
    time: 1,
  });
  assert.deepEqual(trace.find((frame) => frame.sequence === "win" && frame.skipped), {
    active: false,
    observations: [],
    restoredCamera: "camera.main",
    sequence: "win",
    skipped: true,
    tick: 4,
    time: 0.5,
  });
});
