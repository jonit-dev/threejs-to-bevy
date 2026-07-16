import { BENCHMARK_OBSERVATION_PROTOCOL_VERSION, getProofContract } from "./proof-contract.js";
import type {
  BenchmarkObservationAction,
  IBenchmarkBrowserObservationActor,
  IBenchmarkBrowserObservationRoute,
  IBenchmarkBrowserObservationSample,
  IBenchmarkBrowserObservationTrace,
  IBenchmarkProofResult,
} from "./types.js";

interface IEvaluatedAssertion {
  details: Record<string, unknown>;
  id: string;
  pass: boolean;
}

export function evaluateBrowserObservationProof(trace: IBenchmarkBrowserObservationTrace): IBenchmarkProofResult | undefined {
  if (
    trace.schema !== "threenative.agent-benchmark-observation-trace"
    || trace.version !== 1
    || trace.observationProtocolVersion !== BENCHMARK_OBSERVATION_PROTOCOL_VERSION
  ) {
    return undefined;
  }
  const contract = getProofContract(trace.promptId);
  if (contract === undefined) return undefined;
  const evaluated = trace.promptId === "grid-push-puzzle"
    ? evaluateGrid(trace)
    : trace.promptId === "wave-defense"
      ? evaluateWave(trace)
      : trace.promptId === "turn-based-tactics"
        ? evaluateTactics(trace)
        : undefined;
  if (evaluated === undefined) return undefined;
  const byId = new Map(evaluated.map((assertion) => [assertion.id, assertion]));
  const required = contract.assertions.filter((assertion) => assertion.required).map((assertion) => assertion.id);
  const assertions = required.map((id) => byId.get(id) ?? ({ details: { evidence: "No scorer-owned observation predicate was evaluated." }, id, pass: false }));
  return {
    assertions,
    classification: contract.classification,
    ok: assertions.every((assertion) => assertion.pass),
    promptId: trace.promptId,
    requiredAssertionIds: required,
  };
}

function evaluateGrid(trace: IBenchmarkBrowserObservationTrace): IEvaluatedAssertion[] {
  const canvas = canvasEvidence(trace, "grid-canvas");
  const movement = orderedRoute(trace, "grid-movement", ["start", "moved", "blocked"]);
  const movementPass = movement !== undefined
    && visibleRole(movement[0]!, "grid")
    && visibleRole(movement[0]!, "wall")
    && correlatedInput(movement[1]!)
    && isKey(movement[2]!.action)
    && cellDistance(visibleActor(movement[0]!, "player"), visibleActor(movement[1]!, "player")) === 1
    && cellDistance(visibleActor(movement[1]!, "player"), visibleActor(movement[2]!, "player")) === 0;

  const push = orderedRoute(trace, "grid-push-and-pull", ["start", "pushed", "pull-attempt"]);
  const pushEvidence = push === undefined ? undefined : gridPushEvidence(push);
  const pushPass = pushEvidence?.push === true && pushEvidence.noPull === true;

  const goal = orderedRoute(trace, "grid-goal-and-retry", ["start", "progress", "complete", "reset"]);
  const goalEvidence = goal === undefined ? undefined : gridGoalEvidence(goal);

  return [
    assertion("webgl-canvas", canvas, "Scorer observed a nonblank WebGL frame on the dedicated grid canvas route."),
    assertion("grid-movement", movementPass, "A visible player moved exactly one cell under input and a later input was blocked at visible grid/wall bounds."),
    assertion("crate-push", pushPass, "At least two visible pushables were present; one moved with a valid push and remained fixed during the immediately reversed pull attempt."),
    assertion("goal-progress", goalEvidence?.complete === true, "Visible goal progress increased, reached every visible goal, and entered a visible success phase."),
    assertion("retry-path", goalEvidence?.reset === true, "Input after success reset visible goal progress and returned active play."),
  ];
}

function gridPushEvidence(samples: readonly IBenchmarkBrowserObservationSample[]): { noPull: boolean; push: boolean } {
  const [start, pushed, pullAttempt] = samples;
  if (start === undefined || pushed === undefined || pullAttempt === undefined || !correlatedInput(pushed) || !correlatedInput(pullAttempt)) return { noPull: false, push: false };
  const startPlayer = visibleActor(start, "player");
  const pushedPlayer = visibleActor(pushed, "player");
  const pullPlayer = visibleActor(pullAttempt, "player");
  const playerDelta = cellDelta(startPlayer, pushedPlayer);
  if (playerDelta === undefined || manhattan(playerDelta) !== 1 || pushedPlayer?.cell === undefined || startPlayer?.cell === undefined || pullPlayer?.cell === undefined) return { noPull: false, push: false };
  const startPushables = visibleActors(start, "pushable");
  if (startPushables.length < 2 || visibleActors(pushed, "pushable").length < 2 || visibleActors(pullAttempt, "pushable").length < 2) return { noPull: false, push: false };
  const moved = startPushables.find((candidate) => {
    const after = visibleActorById(pushed, candidate.id);
    const delta = cellDelta(candidate, after);
    return delta !== undefined
      && delta[0] === playerDelta[0]
      && delta[1] === playerDelta[1]
      && after?.cell !== undefined
      && equalCell(pushedPlayer.cell!, candidate.cell!);
  });
  if (moved === undefined) return { noPull: false, push: false };
  const pushedCrate = visibleActorById(pushed, moved.id);
  const pullCrate = visibleActorById(pullAttempt, moved.id);
  const pullDelta = cellDelta(pushedPlayer, pullPlayer);
  const reverse = pullDelta !== undefined && pullDelta[0] === -playerDelta[0] && pullDelta[1] === -playerDelta[1];
  return { noPull: reverse && cellDistance(pushedCrate, pullCrate) === 0, push: true };
}

function gridGoalEvidence(samples: readonly IBenchmarkBrowserObservationSample[]): { complete: boolean; reset: boolean } {
  const [start, progress, complete, reset] = samples;
  if (start === undefined || progress === undefined || complete === undefined || reset === undefined) return { complete: false, reset: false };
  const values = samples.map((sample) => ({ count: visibleNumber(sample, "grid.goalCount"), total: visibleNumber(sample, "grid.goalTotal") }));
  const total = values[0]?.total;
  const visibleGoals = visibleActors(start, "goal").length;
  const completion = total !== undefined
    && total >= 2
    && visibleGoals >= total
    && visibleActors(complete, "goal").length >= total
    && values.every((value) => value.total === total)
    && values[0]!.count !== undefined
    && values[1]!.count !== undefined
    && values[2]!.count === total
    && values[1]!.count! > values[0]!.count!
    && correlatedInput(progress)
    && correlatedInput(complete)
    && complete.state === "success"
    && complete.visibility.phase;
  const resetPass = completion
    && correlatedInput(reset)
    && reset.state === "active"
    && reset.visibility.phase
    && values[3]!.count === values[0]!.count;
  return { complete: completion, reset: resetPass };
}

function evaluateWave(trace: IBenchmarkBrowserObservationTrace): IEvaluatedAssertion[] {
  const canvas = canvasEvidence(trace, "wave-canvas");
  const control = orderedRoute(trace, "wave-defender-control", ["start", "moved", "aimed", "attacked"]);
  const movement = control !== undefined
    && correlatedInput(control[1]!, "key")
    && (
      positionDistance(visibleActor(control[0], "defender"), visibleActor(control[1], "defender")) > 0
      || cellDistance(visibleActor(control[0], "defender"), visibleActor(control[1], "defender")) > 0
    );
  const pointerControl = control !== undefined && (
    (correlatedInput(control[2]!, "pointer") && changedVisibleMetric(control[1], control[2], "defender.aim"))
    || (correlatedInput(control[3]!, "pointer") && increasedVisibleMetric(control[2], control[3], "defender.attackCount"))
  );

  const progression = orderedRoute(trace, "wave-progression", ["wave-one", "wave-two"]);
  const progressionPass = progression !== undefined
    && correlatedAction(progression[1]!)
    && increasedVisibleMetric(progression[0], progression[1], "wave.index")
    && increasedVisibleMetric(progression[0], progression[1], "wave.difficulty")
    && nonDecreasingVisibleMetric(progression[0], progression[1], "wave.enemyCount")
    && visibleRole(progression[0]!, "enemy")
    && visibleRole(progression[1]!, "enemy");

  const failure = orderedRoute(trace, "wave-base-failure-retry", ["healthy", "failed", "reset"]);
  const failurePass = failure !== undefined
    && visibleRole(failure[0]!, "base")
    && visibleRole(failure[1]!, "base")
    && correlatedAction(failure[1]!)
    && decreasedVisibleMetric(failure[0], failure[1], "base.health")
    && visibleNumber(failure[1], "base.health") === 0
    && failure[1]?.state === "failure"
    && failure[1].visibility.phase;
  const retryPass = failurePass
    && failure !== undefined
    && correlatedInput(failure[2]!)
    && failure[2]?.state === "active"
    && failure[2].visibility.phase
    && increasedVisibleMetric(failure[1], failure[2], "base.health")
    && visibleNumber(failure[2], "wave.index") === 1;

  return [
    assertion("webgl-canvas", canvas, "Scorer observed a nonblank WebGL frame on the dedicated wave canvas route."),
    assertion("defender-input", movement && pointerControl, "Keyboard input visibly moved the defender and pointer aim/attack input changed visible typed control state."),
    assertion("wave-progression", progressionPass, "A later visible wave increased its index and difficulty without reducing visible enemy count."),
    assertion("base-failure", failurePass, "Visible base health decreased to zero and the visible phase became failure."),
    assertion("retry-path", retryPass, "Keyboard or pointer input restored positive base health, wave one, and active play after failure."),
  ];
}

function evaluateTactics(trace: IBenchmarkBrowserObservationTrace): IEvaluatedAssertion[] {
  const canvas = canvasEvidence(trace, "tactics-canvas");
  const control = orderedRoute(trace, "tactics-unit-control", ["unselected", "selected", "moved"]);
  const unselected = control === undefined ? undefined : visibleActor(control[0], "unit");
  const selected = control === undefined ? undefined : visibleActorById(control[1]!, unselected?.id);
  const moved = control === undefined ? undefined : visibleActorById(control[2]!, unselected?.id);
  const controlPass = control !== undefined
    && unselected?.selected !== true
    && selected?.selected === true
    && correlatedInput(control[1]!)
    && correlatedInput(control[2]!)
    && cellDistance(selected, moved) === 1;

  const enemyTurn = orderedRoute(trace, "tactics-enemy-turn", ["player-turn", "opponent-moved"]);
  const enemyBefore = enemyTurn === undefined ? undefined : visibleActor(enemyTurn[0], "enemy");
  const enemyAfter = enemyTurn === undefined ? undefined : visibleActorById(enemyTurn[1]!, enemyBefore?.id);
  const enemyPass = enemyTurn !== undefined
    && (enemyTurn[0]?.state === "player-turn" || enemyTurn[0]?.state === "active")
    && enemyTurn[1]?.state === "enemy-turn"
    && enemyTurn[0].visibility.phase
    && enemyTurn[1].visibility.phase
    && correlatedAction(enemyTurn[1])
    && (cellDistance(enemyBefore, enemyAfter) > 0 || increasedVisibleMetric(enemyTurn[0], enemyTurn[1], "tactics.threat"));

  const success = orderedRoute(trace, "tactics-success", ["start", "success"]);
  const successPass = success !== undefined
    && correlatedInput(success[1]!)
    && success[1]?.state === "success"
    && success[1].visibility.phase
    && visibleRole(success[1], "objective")
    && (increasedVisibleMetric(success[0], success[1], "tactics.objectiveProgress") || increasedVisibleMetric(success[0], success[1], "tactics.turn"));
  const failure = orderedRoute(trace, "tactics-failure-retry", ["start", "failure", "reset"]);
  const failurePass = failure !== undefined
    && failure[1]?.state === "failure"
    && failure[1].visibility.phase
    && visibleRole(failure[1], "objective")
    && correlatedAction(failure[1])
    && nonDecreasingVisibleMetric(failure[0], failure[1], "tactics.turn");
  const retryPass = failurePass
    && failure !== undefined
    && correlatedInput(failure[2]!)
    && failure[2]?.state === "active"
    && failure[2].visibility.phase
    && (
      decreasedVisibleMetric(failure[1], failure[2], "tactics.objectiveProgress")
      || decreasedVisibleMetric(failure[1], failure[2], "tactics.turn")
      || decreasedVisibleMetric(failure[1], failure[2], "tactics.threat")
    );

  return [
    assertion("webgl-canvas", canvas, "Scorer observed a nonblank WebGL frame on the dedicated tactics canvas route."),
    assertion("unit-selection-movement", controlPass, "Input changed a visible unit from unselected to selected and moved that same unit exactly one cell."),
    assertion("enemy-turn", enemyPass, "A distinct visible enemy turn changed an enemy cell or increased visible threat."),
    assertion("objective-outcomes", successPass && failurePass, "Separate typed routes advanced visible progress to success and reached a visible failure outcome."),
    assertion("retry-path", retryPass, "Input after failure reset visible objective/turn progress and restored active play."),
  ];
}

function orderedRoute(trace: IBenchmarkBrowserObservationTrace, id: string, checkpoints: readonly string[]): IBenchmarkBrowserObservationSample[] | undefined {
  const matches = trace.routes.filter((route) => route.id === id);
  if (matches.length !== 1) return undefined;
  const route = matches[0]!;
  if (!validOrdering(route)) return undefined;
  const selected = route.samples.filter((sample) => (
    sample.checkpoint !== "before" && !sample.checkpoint.startsWith("@scorer/")
  ));
  if (
    selected.length !== checkpoints.length
    || new Set(selected.map((sample) => sample.checkpoint)).size !== selected.length
    || selected.some((sample, index) => sample.checkpoint !== checkpoints[index])
  ) return undefined;
  return selected;
}

function validOrdering(route: IBenchmarkBrowserObservationRoute): boolean {
  return route.samples.every((sample, index) => index === 0 || (
    sample.sequence > route.samples[index - 1]!.sequence
    && sample.timestampMs >= route.samples[index - 1]!.timestampMs
  ));
}

function canvasEvidence(trace: IBenchmarkBrowserObservationTrace, routeId: string): boolean {
  const samples = orderedRoute(trace, routeId, ["rendered"]);
  const canvas = samples?.[0]?.visibility.canvas;
  return canvas?.webgl === true && canvas.nonblank === true && canvas.frameSha256.trim() !== "";
}

function assertion(id: string, pass: boolean, evidence: string): IEvaluatedAssertion {
  return { details: { evidence }, id, pass };
}

function visibleActor(sample: IBenchmarkBrowserObservationSample | undefined, role: IBenchmarkBrowserObservationActor["roles"][number]): IBenchmarkBrowserObservationActor | undefined {
  return sample?.actors.find((actor) => actor.roles.includes(role) && actor.visible && sample.visibility.actorIds.includes(actor.id));
}

function visibleActors(sample: IBenchmarkBrowserObservationSample, role: IBenchmarkBrowserObservationActor["roles"][number]): IBenchmarkBrowserObservationActor[] {
  return sample.actors.filter((actor) => actor.roles.includes(role) && actor.visible && sample.visibility.actorIds.includes(actor.id));
}

function visibleActorById(sample: IBenchmarkBrowserObservationSample, id: string | undefined): IBenchmarkBrowserObservationActor | undefined {
  return id === undefined ? undefined : sample.actors.find((actor) => actor.id === id && actor.visible && sample.visibility.actorIds.includes(actor.id));
}

function visibleRole(sample: IBenchmarkBrowserObservationSample, role: IBenchmarkBrowserObservationActor["roles"][number]): boolean {
  return visibleActor(sample, role) !== undefined;
}

function visibleNumber(sample: IBenchmarkBrowserObservationSample | undefined, id: string): number | undefined {
  const value = sample?.metrics[id];
  return sample?.visibility.metricIds.includes(id) === true && typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function increasedVisibleMetric(before: IBenchmarkBrowserObservationSample | undefined, after: IBenchmarkBrowserObservationSample | undefined, id: string): boolean {
  const left = before === undefined ? undefined : visibleNumber(before, id);
  const right = after === undefined ? undefined : visibleNumber(after, id);
  return left !== undefined && right !== undefined && right > left;
}

function decreasedVisibleMetric(before: IBenchmarkBrowserObservationSample | undefined, after: IBenchmarkBrowserObservationSample | undefined, id: string): boolean {
  const left = before === undefined ? undefined : visibleNumber(before, id);
  const right = after === undefined ? undefined : visibleNumber(after, id);
  return left !== undefined && right !== undefined && right < left;
}

function changedVisibleMetric(before: IBenchmarkBrowserObservationSample | undefined, after: IBenchmarkBrowserObservationSample | undefined, id: string): boolean {
  const left = before === undefined ? undefined : visibleNumber(before, id);
  const right = after === undefined ? undefined : visibleNumber(after, id);
  return left !== undefined && right !== undefined && right !== left;
}

function nonDecreasingVisibleMetric(before: IBenchmarkBrowserObservationSample | undefined, after: IBenchmarkBrowserObservationSample | undefined, id: string): boolean {
  const left = before === undefined ? undefined : visibleNumber(before, id);
  const right = after === undefined ? undefined : visibleNumber(after, id);
  return left !== undefined && right !== undefined && right >= left;
}

function cellDelta(before: IBenchmarkBrowserObservationActor | undefined, after: IBenchmarkBrowserObservationActor | undefined): [number, number] | undefined {
  return before?.cell === undefined || after?.cell === undefined ? undefined : [after.cell[0] - before.cell[0], after.cell[1] - before.cell[1]];
}

function cellDistance(before: IBenchmarkBrowserObservationActor | undefined, after: IBenchmarkBrowserObservationActor | undefined): number {
  const delta = cellDelta(before, after);
  return delta === undefined ? Number.POSITIVE_INFINITY : manhattan(delta);
}

function positionDistance(before: IBenchmarkBrowserObservationActor | undefined, after: IBenchmarkBrowserObservationActor | undefined): number {
  if (before?.position === undefined || after?.position === undefined) return 0;
  return Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1], after.position[2] - before.position[2]);
}

function manhattan(delta: readonly [number, number]): number {
  return Math.abs(delta[0]) + Math.abs(delta[1]);
}

function equalCell(left: readonly [number, number], right: readonly [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function isInput(action: BenchmarkObservationAction | undefined): boolean {
  return isKey(action) || isPointer(action);
}

function isKey(action: BenchmarkObservationAction | undefined): boolean {
  return action?.kind === "key";
}

function isPointer(action: BenchmarkObservationAction | undefined): boolean {
  return action?.kind === "pointer";
}

function correlatedAction(sample: IBenchmarkBrowserObservationSample): boolean {
  return sample.action?.kind === "wait"
    ? Number.isFinite(sample.action.durationMs) && sample.action.durationMs >= 0
    : sample.action !== undefined && sample.visibility.inputCorrelated;
}

function correlatedInput(sample: IBenchmarkBrowserObservationSample, kind?: "key" | "pointer"): boolean {
  return sample.visibility.inputCorrelated
    && (kind === "key" ? isKey(sample.action) : kind === "pointer" ? isPointer(sample.action) : isInput(sample.action));
}
