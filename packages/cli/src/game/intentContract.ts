import {
  type IGameAcceptanceAssertion,
  type IGameIntentContract,
  type IGameIntentVerb,
} from "../commands/gamePlanTypes.js";

interface IIntentProfile {
  acceptanceAssertions: IGameAcceptanceAssertion[];
  capabilityIds: string[];
  id: string;
  incompatibleWith?: string[];
  keywordGroups: string[][];
  prototype?: IGameIntentContract["prototype"];
  verbs: IGameIntentVerb[];
}

export interface IIntentContractBuildResult {
  ambiguousInterpretationIds: string[];
  contract: IGameIntentContract;
  semanticCoverageComplete: boolean;
}

export interface IIntentCoverage {
  coveredResponsibilityIds: string[];
  uncoveredResponsibilityIds: string[];
}

const PROFILES: readonly IIntentProfile[] = [
  profile({
    acceptanceAssertions: [
      assertion("webgl-canvas", "progress", "Active play renders in a nonblank WebGL canvas."),
      assertion("grid-movement", "movement", "Keyboard input moves the player by one visible grid cell and blocked cells prevent movement."),
      assertion("crate-push", "interaction", "The player pushes an adjacent crate into a free cell and cannot pull it."),
      assertion("goal-progress", "progress", "Crates occupying goals update visible progress and complete the objective."),
      assertion("retry-path", "retry", "Reset input restores the initial grid state."),
    ],
    capabilityIds: ["move.grid", "interaction.push", "objective.occupancy", "state.retry"],
    id: "grid-push",
    incompatibleWith: ["physics-knockdown"],
    keywordGroups: [["grid", "cell", "tile"], ["push", "pushing", "pushes"], ["crate", "crates", "box", "boxes"]],
    verbs: [
      verb("move.grid", "player", "move", "grid-cell"),
      verb("interaction.push", "player", "push", "crate"),
      verb("objective.occupancy", "crate", "occupy", "goal"),
      verb("state.retry", "player", "retry", "game"),
    ],
  }),
  profile({
    acceptanceAssertions: [
      assertion("launch-or-push", "interaction", "Input launches or drives a physics object into visible targets."),
      assertion("target-displacement", "progress", "Impacted targets visibly move or fall and update score."),
      assertion("score-updates", "progress", "The score updates when targets are displaced."),
      assertion("retry-path", "retry", "Retry input restores the targets and score."),
    ],
    capabilityIds: ["physics-target"],
    id: "physics-knockdown",
    incompatibleWith: ["grid-push"],
    keywordGroups: [["knockdown", "knock down", "projectile", "physics"], ["target", "targets"]],
    verbs: [
      verb("interaction.projectile-impact", "player", "launch", "projectile"),
      verb("objective.target-displacement", "projectile", "displace", "target"),
      verb("state.retry", "player", "retry", "game"),
    ],
  }),
  profile({
    acceptanceAssertions: [
      assertion("keyboard-movement", "movement", "Input moves the player through the collection space."),
      assertion("pickup-objective", "progress", "Collecting rewards updates visible progress."),
      assertion("win-state", "progress", "Collecting every reward reaches a clear win state."),
      assertion("retry-path", "retry", "The game provides a retry path after completion or failure."),
    ],
    capabilityIds: ["controller.top-down"],
    id: "top-down-collector",
    keywordGroups: [["collect", "collectible", "collector", "pickup", "coin", "salvage", "gather", "rescue", "forage"]],
    verbs: [
      verb("move.free", "player", "move", "arena"),
      verb("interaction.collect", "player", "collect", "reward"),
      verb("objective.collection", "player", "complete", "collection"),
    ],
  }),
  profile({
    acceptanceAssertions: [
      assertion("lane-movement", "movement", "Input changes the player's visible lane."),
      assertion("obstacle-fail", "interaction", "Obstacle contact reaches a fail state."),
      assertion("distance-objective", "progress", "Survival advances distance or speed progression."),
      assertion("retry-path", "retry", "Retry restarts the run after failure."),
    ],
    capabilityIds: ["controller.lane-runner"],
    id: "lane-runner",
    keywordGroups: [["lane", "runner", "dodge", "traffic"]],
    verbs: [
      verb("move.lane", "player", "change", "lane"),
      verb("interaction.avoid", "player", "avoid", "obstacle"),
      verb("objective.distance", "player", "advance", "distance"),
    ],
  }),
  profile({
    acceptanceAssertions: [
      assertion("ordered-checkpoints", "movement", "Input visibly drives the vehicle through ordered checkpoints."),
      assertion("timer-or-counter", "progress", "A timer or checkpoint counter updates during play."),
      assertion("finish-state", "progress", "The final checkpoint reaches a finish state."),
      assertion("retry-path", "retry", "Retry resets the route or race."),
    ],
    capabilityIds: ["objective.checkpoint-race"],
    id: "checkpoint-race",
    keywordGroups: [["checkpoint", "lap", "race", "racing", "kart"]],
    verbs: [
      verb("move.vehicle", "player", "drive", "vehicle"),
      verb("objective.checkpoint", "vehicle", "cross", "checkpoint"),
      verb("state.retry", "player", "retry", "race"),
    ],
  }),
  profile({
    acceptanceAssertions: [
      assertion("webgl-canvas", "progress", "Active play renders in a nonblank WebGL canvas."),
      assertion("defender-input", "movement", "Keyboard and pointer input visibly control the defender."),
      assertion("wave-progression", "progress", "Successive enemy waves advance visible progression."),
      assertion("base-failure", "interaction", "Enemy damage can fail the base."),
      assertion("retry-path", "retry", "Input retries from failure and restarts active play."),
    ],
    capabilityIds: ["move.aim", "spawn.wave", "state.base-health", "progress.wave", "state.retry"],
    id: "wave-defense",
    keywordGroups: [["wave", "waves"], ["defense", "defend", "base"], ["enemy", "enemies"]],
    prototype: {
      id: "continuous-arena-pooled-pressure",
      proofRoles: {
        "base-failure": "failure",
        "defender-input": "primary-input",
        "retry-path": "retry",
        "wave-progression": "progression",
        "webgl-canvas": "canvas",
      },
    },
    verbs: [
      verb("move.aim", "defender", "aim", "attack"),
      verb("spawn.wave", "game", "spawn", "enemy-wave"),
      verb("state.base-health", "enemy", "damage", "base"),
      verb("state.retry", "player", "retry", "game"),
    ],
  }),
  profile({
    acceptanceAssertions: [
      assertion("webgl-canvas", "progress", "Active play renders in a nonblank WebGL canvas."),
      assertion("unit-selection-movement", "movement", "Input selects and moves a visible unit on the grid."),
      assertion("enemy-turn", "interaction", "An enemy turn visibly changes the board or threat."),
      assertion("objective-outcomes", "progress", "The encounter reaches visible objective, success, and failure outcomes."),
      assertion("retry-path", "retry", "Input retries an outcome and resets the encounter."),
    ],
    capabilityIds: ["selection.unit", "move.grid-turn", "turn.enemy", "objective.tactics", "state.retry"],
    id: "turn-based-tactics",
    keywordGroups: [["turn-based", "turn based", "tactics", "tactical"], ["select", "selection", "unit"], ["enemy turn"]],
    prototype: {
      id: "alternating-grid-single-pursuit",
      proofRoles: {
        "enemy-turn": "opponent-turn",
        "objective-outcomes": "objective-outcomes",
        "retry-path": "retry",
        "unit-selection-movement": "primary-input",
        "webgl-canvas": "canvas",
      },
    },
    verbs: [
      verb("selection.unit", "player", "select", "unit"),
      verb("move.grid-turn", "unit", "move", "grid-cell"),
      verb("turn.enemy", "enemy", "take", "turn"),
      verb("state.retry", "player", "retry", "encounter"),
    ],
  }),
];

export function buildIntentContract(goal: string): IIntentContractBuildResult {
  const normalizedGoal = normalize(goal);
  const scores = PROFILES.map((candidate) => ({
    candidate,
    score: candidate.keywordGroups.reduce((sum, group) => sum + (group.some((keyword) => includesPhrase(normalizedGoal, keyword)) ? 1 : 0), 0),
  }));
  const highestScore = Math.max(...scores.map((item) => item.score));
  const leaders = scores.filter((item) => item.score === highestScore && item.score > 0).map((item) => item.candidate);
  const selected = leaders[0] ?? customProfile(goal);
  const ambiguousInterpretationIds = leaders
    .filter((candidate) => candidate.id === selected.id || selected.incompatibleWith?.includes(candidate.id) === true || candidate.incompatibleWith?.includes(selected.id) === true)
    .map((candidate) => candidate.id)
    .sort();
  return {
    ambiguousInterpretationIds: ambiguousInterpretationIds.length > 1 ? ambiguousInterpretationIds : [],
    contract: {
      acceptanceAssertions: selected.acceptanceAssertions,
      id: `intent.${selected.id}`,
      ...(selected.prototype === undefined ? {} : { prototype: selected.prototype }),
      requiredCapabilities: selected.capabilityIds,
      schema: "threenative.game-intent",
      verbs: selected.verbs,
      version: 1,
    },
    semanticCoverageComplete: selected.keywordGroups.length === 0 || selected.keywordGroups.every((group) => group.some((keyword) => includesPhrase(normalizedGoal, keyword))),
  };
}

export function evaluateIntentCoverage(contract: IGameIntentContract, availableResponsibilityIds: Iterable<string>): IIntentCoverage {
  const available = new Set(availableResponsibilityIds);
  const coveredResponsibilityIds = contract.requiredCapabilities.filter((id) => available.has(id));
  return {
    coveredResponsibilityIds,
    uncoveredResponsibilityIds: contract.requiredCapabilities.filter((id) => !available.has(id)),
  };
}

function profile(value: IIntentProfile): IIntentProfile {
  return value;
}

function customProfile(goal: string): IIntentProfile {
  return profile({
    acceptanceAssertions: [
      assertion("input-caused-action", "interaction", "Real input visibly causes the requested core action."),
      assertion("objective-progress", "progress", "Play visibly advances toward the requested objective."),
      assertion("fail-retry", "retry", "The game exposes a fail or completion state and a retry path."),
    ],
    capabilityIds: ["custom.loop"],
    id: "custom",
    keywordGroups: [],
    verbs: [verb("custom.loop", "player", "perform", normalize(goal) || "requested-game-loop")],
  });
}

function assertion(id: string, kind: IGameAcceptanceAssertion["kind"], description: string): IGameAcceptanceAssertion {
  const family = id === "webgl-canvas" ? "canvas-render"
    : id === "grid-movement" ? "blocked-movement"
    : id === "crate-push" ? "push-only"
      : id === "goal-progress" || id === "pickup-objective" || id === "timer-or-counter" || id === "wave-progression" || kind === "progress" ? "objective-progress"
        : kind === "movement" ? "movement"
          : kind === "retry" ? "retry"
            : kind === "interaction" ? "state-change"
              : undefined;
  return { description, id, kind, ...(family === undefined ? {} : { proof: { family, templateId: `acceptance-${id}` } }), required: true };
}

function verb(id: string, subject: string, action: string, object: string): IGameIntentVerb {
  return { action, id, object, required: true, subject };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesPhrase(normalizedGoal: string, keyword: string): boolean {
  const normalizedKeyword = normalize(keyword);
  return ` ${normalizedGoal} `.includes(` ${normalizedKeyword} `);
}
