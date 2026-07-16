import assert from "node:assert/strict";
import test from "node:test";

import { BENCHMARK_OBSERVATION_PROTOCOL_VERSION } from "./proof-contract.js";
import { evaluateBrowserObservationProof } from "./browser-proof-evaluator.js";
import type {
  BenchmarkObservationAction,
  BenchmarkObservationPhase,
  IBenchmarkBrowserObservationActor,
  IBenchmarkBrowserObservationRoute,
  IBenchmarkBrowserObservationSample,
  IBenchmarkBrowserObservationTrace,
} from "./types.js";

test("should prove the complete grid contract from distinct typed routes", () => {
  const proof = evaluateBrowserObservationProof(gridTrace());

  assert.equal(proof?.ok, true);
  assert.deepEqual(proof?.assertions.map(({ id, pass }) => [id, pass]), [
    ["webgl-canvas", true],
    ["grid-movement", true],
    ["crate-push", true],
    ["goal-progress", true],
    ["retry-path", true],
  ]);
});

test("should reject grid labels and random frame changes without typed movement or push transitions", () => {
  const trace = gridTrace();
  const movement = route(trace, "grid-movement");
  movement.samples[1]!.actors = movement.samples[0]!.actors;
  const push = route(trace, "grid-push-and-pull");
  push.samples[1]!.actors = push.samples[0]!.actors;
  for (const sample of [...movement.samples, ...push.samples]) {
    sample.metrics.label = "PLAYER MOVED - TWO CRATES PUSHED - YOU WIN";
    sample.visibility.canvas = { frameSha256: `random-${sample.sequence}`, nonblank: true, webgl: true };
  }

  const proof = evaluateBrowserObservationProof(trace);

  assert.equal(proof?.assertions.find((item) => item.id === "grid-movement")?.pass, false);
  assert.equal(proof?.assertions.find((item) => item.id === "crate-push")?.pass, false);
});

test("should prove wave control progression failure and retry from raw transitions", () => {
  const proof = evaluateBrowserObservationProof(waveTrace());

  assert.equal(proof?.ok, true);
  assert.deepEqual(proof?.assertions.map(({ id, pass }) => [id, pass]), [
    ["webgl-canvas", true],
    ["defender-input", true],
    ["wave-progression", true],
    ["base-failure", true],
    ["retry-path", true],
  ]);
});

test("should reject wave difficulty and base-health transitions in the wrong direction", () => {
  const trace = waveTrace();
  const progression = route(trace, "wave-progression");
  progression.samples[1]!.metrics["wave.difficulty"] = 1;
  const failure = route(trace, "wave-base-failure-retry");
  failure.samples[1]!.metrics["base.health"] = 120;
  failure.samples[1]!.state = "active";

  const proof = evaluateBrowserObservationProof(trace);

  assert.equal(proof?.assertions.find((item) => item.id === "wave-progression")?.pass, false);
  assert.equal(proof?.assertions.find((item) => item.id === "base-failure")?.pass, false);
});

test("should require both pointer attack and keyboard movement for defender input", () => {
  const trace = waveTrace();
  route(trace, "wave-defender-control").samples = route(trace, "wave-defender-control").samples.slice(0, 2);

  const proof = evaluateBrowserObservationProof(trace);

  assert.equal(proof?.assertions.find((item) => item.id === "defender-input")?.pass, false);
});

test("should prove tactics selection movement enemy turn both outcomes and retry", () => {
  const proof = evaluateBrowserObservationProof(tacticsTrace());

  assert.equal(proof?.ok, true);
  assert.deepEqual(proof?.assertions.map(({ id, pass }) => [id, pass]), [
    ["webgl-canvas", true],
    ["unit-selection-movement", true],
    ["enemy-turn", true],
    ["objective-outcomes", true],
    ["retry-path", true],
  ]);
});

test("should reject tactics proof when either success or failure outcome is missing", () => {
  const trace = tacticsTrace();
  trace.routes = trace.routes.filter((candidate) => candidate.id !== "tactics-failure-retry");

  const proof = evaluateBrowserObservationProof(trace);

  assert.equal(proof?.assertions.find((item) => item.id === "objective-outcomes")?.pass, false);
  assert.equal(proof?.assertions.find((item) => item.id === "retry-path")?.pass, false);
});

test("should not treat candidate pass flags as observation evidence", () => {
  const trace = {
    ...traceFor("wave-defense", [canvasRoute("wave-canvas")]),
    assertions: [{ id: "wave-progression", pass: true }],
    pass: true,
  } as unknown as IBenchmarkBrowserObservationTrace;

  const proof = evaluateBrowserObservationProof(trace);

  assert.equal(proof?.ok, false);
  assert.equal(proof?.assertions.find((item) => item.id === "wave-progression")?.pass, false);
});

test("should reject traces from a different observation protocol version", () => {
  const trace = { ...gridTrace(), observationProtocolVersion: "observation-route-v0" };

  assert.equal(evaluateBrowserObservationProof(trace), undefined);
});

test("should ignore scorer capture samples while matching exact candidate checkpoints", () => {
  const trace = tacticsTrace();
  const enemyRoute = route(trace, "tactics-enemy-turn");
  enemyRoute.samples = [
    sample("before", -1, []),
    enemyRoute.samples[0]!,
    sample("@scorer/action-0-before", 0.5, []),
    enemyRoute.samples[1]!,
  ];

  const proof = evaluateBrowserObservationProof(trace);

  assert.equal(proof?.assertions.find((item) => item.id === "enemy-turn")?.pass, true);

  enemyRoute.samples.push(sample("candidate-label", 2, []));
  const extraCandidateCheckpoint = evaluateBrowserObservationProof(trace);
  assert.equal(extraCandidateCheckpoint?.assertions.find((item) => item.id === "enemy-turn")?.pass, false);
});

function gridTrace(): IBenchmarkBrowserObservationTrace {
  const board = [
    actor("board", ["grid"], { visible: true }),
    actor("wall", ["wall"], { visible: true }),
    actor("goal-a", ["goal"], { cell: [2, 0], visible: true }),
    actor("goal-b", ["goal"], { cell: [3, 3], visible: true }),
  ];
  const crates = [actor("crate-a", ["pushable"], { cell: [1, 0], visible: true }), actor("crate-b", ["pushable"], { cell: [3, 2], visible: true })];
  return traceFor("grid-push-puzzle", [
    canvasRoute("grid-canvas"),
    {
      id: "grid-movement",
      samples: [
        sample("start", 0, [...board, actor("player", ["player"], { cell: [0, 1], visible: true }), ...crates]),
        sample("moved", 1, [...board, actor("player", ["player"], { cell: [0, 0], visible: true }), ...crates], key("ArrowUp")),
        sample("blocked", 2, [...board, actor("player", ["player"], { cell: [0, 0], visible: true }), ...crates], key("ArrowUp")),
      ],
    },
    {
      id: "grid-push-and-pull",
      samples: [
        sample("start", 0, [...board, actor("player", ["player"], { cell: [0, 0], visible: true }), ...crates]),
        sample("pushed", 1, [...board, actor("player", ["player"], { cell: [1, 0], visible: true }), actor("crate-a", ["pushable"], { cell: [2, 0], visible: true }), crates[1]!], key("ArrowRight")),
        sample("pull-attempt", 2, [...board, actor("player", ["player"], { cell: [0, 0], visible: true }), actor("crate-a", ["pushable"], { cell: [2, 0], visible: true }), crates[1]!], key("ArrowLeft")),
      ],
    },
    {
      id: "grid-goal-and-retry",
      samples: [
        sample("start", 0, [...board, ...crates], undefined, { "grid.goalCount": 0, "grid.goalTotal": 2 }),
        sample("progress", 1, [...board, ...crates], key("ArrowRight"), { "grid.goalCount": 1, "grid.goalTotal": 2 }),
        sample("complete", 2, [...board, ...crates], key("ArrowRight"), { "grid.goalCount": 2, "grid.goalTotal": 2 }, "success"),
        sample("reset", 3, [...board, ...crates], key("KeyR"), { "grid.goalCount": 0, "grid.goalTotal": 2 }, "active"),
      ],
    },
  ]);
}

function waveTrace(): IBenchmarkBrowserObservationTrace {
  return traceFor("wave-defense", [
    canvasRoute("wave-canvas"),
    {
      id: "wave-defender-control",
      samples: [
        sample("start", 0, [actor("defender", ["defender", "player"], { position: [0, 0, 0], visible: true })], undefined, { "defender.aim": 0, "defender.attackCount": 0 }),
        sample("moved", 1, [actor("defender", ["defender", "player"], { position: [1, 0, 0], visible: true })], key("KeyD"), { "defender.aim": 0, "defender.attackCount": 0 }),
        sample("aimed", 2, [actor("defender", ["defender", "player"], { position: [1, 0, 0], visible: true })], pointer("move"), { "defender.aim": 0.75, "defender.attackCount": 0 }),
        sample("attacked", 3, [actor("defender", ["defender", "player"], { position: [1, 0, 0], visible: true })], pointer("click"), { "defender.aim": 0.75, "defender.attackCount": 1 }),
      ],
    },
    {
      id: "wave-progression",
      samples: [
        sample("wave-one", 0, [actor("enemy-a", ["enemy"], { visible: true })], undefined, { "wave.difficulty": 1, "wave.enemyCount": 4, "wave.index": 1 }),
        sample("wave-two", 1, [actor("enemy-b", ["enemy"], { visible: true })], wait(), { "wave.difficulty": 2, "wave.enemyCount": 5, "wave.index": 2 }),
      ],
    },
    {
      id: "wave-base-failure-retry",
      samples: [
        sample("healthy", 0, [actor("base", ["base"], { visible: true })], undefined, { "base.health": 100, "wave.index": 2 }),
        sample("failed", 1, [actor("base", ["base"], { visible: true })], wait(), { "base.health": 0, "wave.index": 2 }, "failure"),
        sample("reset", 2, [actor("base", ["base"], { visible: true })], key("Enter"), { "base.health": 100, "wave.index": 1 }, "active"),
      ],
    },
  ]);
}

function tacticsTrace(): IBenchmarkBrowserObservationTrace {
  return traceFor("turn-based-tactics", [
    canvasRoute("tactics-canvas"),
    {
      id: "tactics-unit-control",
      samples: [
        sample("unselected", 0, [actor("unit-a", ["unit", "player"], { cell: [0, 0], selected: false, visible: true })]),
        sample("selected", 1, [actor("unit-a", ["unit", "player"], { cell: [0, 0], selected: true, visible: true })], pointer("click")),
        sample("moved", 2, [actor("unit-a", ["unit", "player"], { cell: [1, 0], selected: true, visible: true })], key("ArrowRight")),
      ],
    },
    {
      id: "tactics-enemy-turn",
      samples: [
        sample("player-turn", 0, [actor("enemy", ["enemy"], { cell: [3, 3], visible: true })], undefined, { "tactics.threat": 0, "tactics.turn": 1 }, "player-turn"),
        sample("opponent-moved", 1, [actor("enemy", ["enemy"], { cell: [2, 3], visible: true })], wait(), { "tactics.threat": 1, "tactics.turn": 1 }, "enemy-turn"),
      ],
    },
    {
      id: "tactics-success",
      samples: [
        sample("start", 0, [actor("objective", ["objective"], { visible: true })], undefined, { "tactics.objectiveProgress": 0, "tactics.turn": 1 }, "active"),
        sample("success", 1, [actor("objective", ["objective"], { visible: true })], key("Enter"), { "tactics.objectiveProgress": 3, "tactics.turn": 4 }, "success"),
      ],
    },
    {
      id: "tactics-failure-retry",
      samples: [
        sample("start", 0, [actor("objective", ["objective"], { visible: true })], undefined, { "tactics.objectiveProgress": 1, "tactics.turn": 2 }, "active"),
        sample("failure", 1, [actor("objective", ["objective"], { visible: true })], wait(), { "tactics.objectiveProgress": 1, "tactics.turn": 5 }, "failure"),
        sample("reset", 2, [actor("objective", ["objective"], { visible: true })], key("KeyR"), { "tactics.objectiveProgress": 0, "tactics.turn": 1 }, "active"),
      ],
    },
  ]);
}

function traceFor(promptId: string, routes: IBenchmarkBrowserObservationRoute[]): IBenchmarkBrowserObservationTrace {
  return {
    observationProtocolVersion: BENCHMARK_OBSERVATION_PROTOCOL_VERSION,
    promptId,
    routes,
    schema: "threenative.agent-benchmark-observation-trace",
    version: 1,
  };
}

function canvasRoute(id: string): IBenchmarkBrowserObservationRoute {
  const value = sample("rendered", 0, []);
  value.visibility.canvas = { frameSha256: "scorer-owned-frame", nonblank: true, webgl: true };
  return { id, samples: [value] };
}

function sample(
  checkpoint: string,
  sequence: number,
  actors: IBenchmarkBrowserObservationActor[],
  action?: BenchmarkObservationAction,
  metrics: Record<string, number | string | boolean> = {},
  phase: BenchmarkObservationPhase = "active",
): IBenchmarkBrowserObservationSample {
  return {
    ...(action === undefined ? {} : { action }),
    actors,
    checkpoint,
    metrics,
    phase: sequence === 0 ? "before" : "after",
    sequence,
    state: phase,
    timestampMs: sequence * 100,
    visibility: {
      actorIds: actors.filter((item) => item.visible).map((item) => item.id),
      inputCorrelated: action !== undefined,
      metricIds: Object.keys(metrics),
      phase: true,
    },
  };
}

function actor(id: string, roles: IBenchmarkBrowserObservationActor["roles"], options: Omit<IBenchmarkBrowserObservationActor, "id" | "roles">): IBenchmarkBrowserObservationActor {
  return { id, roles, ...options };
}

function key(code: string): BenchmarkObservationAction {
  return { code, kind: "key", phase: "press" };
}

function pointer(phase: "click" | "move"): BenchmarkObservationAction {
  return { button: 0, kind: "pointer", phase, x: 320, y: 240 };
}

function wait(): BenchmarkObservationAction {
  return { durationMs: 1000, kind: "wait" };
}

function route(trace: IBenchmarkBrowserObservationTrace, id: string): IBenchmarkBrowserObservationRoute {
  const value = trace.routes.find((candidate) => candidate.id === id);
  assert.ok(value);
  return value;
}
