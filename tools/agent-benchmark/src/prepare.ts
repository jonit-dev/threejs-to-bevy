import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

import {
  BENCHMARK_OBSERVATION_PROTOCOL,
  BENCHMARK_OBSERVATION_PROTOCOL_VERSION,
  getProofContract,
} from "./proof-contract.js";
import { BENCHMARK_PROTOCOL } from "./protocol.js";
import { type BenchmarkCondition } from "./types.js";

export interface IPrepareRoundOptions {
  conditions?: BenchmarkCondition[];
  outDir: string;
  promptId?: string;
  promptIds?: string[];
  promptsDir?: string;
  repeats?: number;
  root?: string;
}

export interface IPrepareRoundResult {
  candidates: Array<{
    condition: BenchmarkCondition;
    observationProtocolSha256: string;
    observationProtocolVersion: string;
    path: string;
    promptSha256: string;
    observationRouteSha256: string;
    runId: string;
  }>;
  manifestPath: string;
  ok: boolean;
  promptId: string;
  prompts: string[];
  repeats: number;
}

export interface IPrepareRound5bOptions {
  auditReportPath: string;
  conditions?: BenchmarkCondition[];
  outDir: string;
  promptsDir?: string;
  repeats?: number;
  root?: string;
}

const defaultConditions: BenchmarkCondition[] = ["typed-spec", "threenative", "vanilla"];
const round5bPromptIds = ["lane-runner", "checkpoint-race", "physics-knockdown"] as const;
const OBSERVATION_PROTOCOL = {
  ...BENCHMARK_OBSERVATION_PROTOCOL,
  constraints: {
    checkpointsOnActions: true,
    maxBindings: 16,
    maxRouteActions: 32,
    maxWaitMilliseconds: 2_000,
    normalizedPointerCoordinates: true,
    productSpecificSelectors: false,
  },
  forbiddenFields: ["assertionId", "assertions", "eval", "expected", "javascript", "pass"],
  routePath: "benchmark-observation-route.json",
  routeSchema: "threenative.agent-benchmark-observation-route",
} as const;
const OBSERVATION_PROTOCOL_TEXT = `${JSON.stringify(OBSERVATION_PROTOCOL, null, 2)}\n`;
const OBSERVATION_PROTOCOL_SHA256 = createHash("sha256").update(OBSERVATION_PROTOCOL_TEXT).digest("hex");

export async function prepareRound(options: IPrepareRoundOptions): Promise<IPrepareRoundResult> {
  const root = resolve(options.root ?? process.cwd());
  const promptsDir = resolve(root, options.promptsDir ?? "tools/agent-benchmark/prompts");
  const outDir = resolve(options.outDir);
  const promptIds = options.promptIds ?? [options.promptId ?? "collector"];
  const repeats = options.repeats ?? 3;
  const conditions = options.conditions ?? defaultConditions;
  const candidates: IPrepareRoundResult["candidates"] = [];

  const promptHashes: Record<string, string> = {};
  for (const promptId of promptIds) {
    const promptText = await readFile(resolve(promptsDir, `${promptId}.md`), "utf8");
    const promptSha256 = createHash("sha256").update(promptText).digest("hex");
    const observationRouteText = preparedObservationRouteText(promptId);
    const observationRouteSha256 = createHash("sha256").update(observationRouteText).digest("hex");
    const contract = getProofContract(promptId);
    if (contract === undefined || contract.promptSha256 !== promptSha256) throw new Error(`Prompt '${promptId}' does not match its frozen proof-contract hash.`);
    promptHashes[promptId] = promptSha256;
    for (const condition of conditions) {
      for (let index = 1; index <= repeats; index += 1) {
      const runId = `${promptId}-${condition}-r${index}`;
      const candidateDir = resolve(outDir, "candidates", runId);
      await mkdir(candidateDir, { recursive: true });
      await writeFile(join(candidateDir, "benchmark-prompt.txt"), promptText, "utf8");
      await writeFile(join(candidateDir, "benchmark-observation-protocol.json"), OBSERVATION_PROTOCOL_TEXT, "utf8");
      await writeFile(join(candidateDir, "benchmark-observation-route.json"), observationRouteText, "utf8");
      await writeFile(join(candidateDir, "OPERATOR.md"), operatorInstructions({
        candidateDir,
        condition,
        manifestName: "round-5-prepare-manifest.json",
        outDir,
        promptId,
        root,
        runId,
        neutralHoldout: promptIds.length > 1,
      }), "utf8");
      await writeFile(join(candidateDir, "session.template.json"), `${JSON.stringify(sessionTemplate({ condition, promptId, runId }), null, 2)}\n`, "utf8");
      candidates.push({ condition, observationProtocolSha256: OBSERVATION_PROTOCOL_SHA256, observationProtocolVersion: BENCHMARK_OBSERVATION_PROTOCOL_VERSION, observationRouteSha256, path: candidateDir, promptSha256, runId });
      }
    }
  }

  const manifestPath = resolve(outDir, "round-5-prepare-manifest.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    candidates,
    conditions,
    promptHashes,
    promptId: promptIds.length === 1 ? promptIds[0] : "multi-prompt",
    prompts: promptIds,
    observationProtocol: { ...OBSERVATION_PROTOCOL, sha256: OBSERVATION_PROTOCOL_SHA256 },
    protocol: BENCHMARK_PROTOCOL,
    repeats,
    schema: "threenative.agent-benchmark-round-prepare",
    version: 1,
  }, null, 2)}\n`, "utf8");

  return { candidates, manifestPath, ok: true, promptId: promptIds.length === 1 ? promptIds[0]! : "multi-prompt", prompts: promptIds, repeats };
}

export async function prepareRound5b(options: IPrepareRound5bOptions): Promise<IPrepareRoundResult> {
  const audit = JSON.parse(await readFile(resolve(options.auditReportPath), "utf8")) as unknown;
  if (!auditAllowsRound5b(audit)) {
    throw new Error("Round-5b preparation requires a green next-steps audit with churn budgets complete.");
  }
  const root = resolve(options.root ?? process.cwd());
  const promptsDir = resolve(root, options.promptsDir ?? "tools/agent-benchmark/prompts");
  const outDir = resolve(options.outDir);
  const repeats = options.repeats ?? 3;
  const conditions = options.conditions ?? defaultConditions;
  const candidates: IPrepareRoundResult["candidates"] = [];

  for (const promptId of round5bPromptIds) {
    const promptText = await readFile(resolve(promptsDir, `${promptId}.md`), "utf8");
    const promptSha256 = createHash("sha256").update(promptText).digest("hex");
    const observationRouteText = preparedObservationRouteText(promptId);
    const observationRouteSha256 = createHash("sha256").update(observationRouteText).digest("hex");
    for (const condition of conditions) {
      for (let index = 1; index <= repeats; index += 1) {
        const runId = `${promptId}-${condition}-r${index}`;
        const candidateDir = resolve(outDir, "candidates", runId);
        await mkdir(candidateDir, { recursive: true });
        await writeFile(join(candidateDir, "benchmark-prompt.txt"), promptText, "utf8");
        await writeFile(join(candidateDir, "benchmark-observation-protocol.json"), OBSERVATION_PROTOCOL_TEXT, "utf8");
        await writeFile(join(candidateDir, "benchmark-observation-route.json"), observationRouteText, "utf8");
        await writeFile(join(candidateDir, "OPERATOR.md"), operatorInstructions({
          candidateDir,
          condition,
          manifestName: "round-5b-prepare-manifest.json",
          outDir,
          promptId,
          root,
          runId,
        }), "utf8");
        await writeFile(join(candidateDir, "session.template.json"), `${JSON.stringify(sessionTemplate({ condition, promptId, runId }), null, 2)}\n`, "utf8");
        candidates.push({ condition, observationProtocolSha256: OBSERVATION_PROTOCOL_SHA256, observationProtocolVersion: BENCHMARK_OBSERVATION_PROTOCOL_VERSION, observationRouteSha256, path: candidateDir, promptSha256, runId });
      }
    }
  }

  const manifestPath = resolve(outDir, "round-5b-prepare-manifest.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    candidates,
    conditions,
    promptId: "round-5b",
    prompts: [...round5bPromptIds],
    observationProtocol: { ...OBSERVATION_PROTOCOL, sha256: OBSERVATION_PROTOCOL_SHA256 },
    protocol: BENCHMARK_PROTOCOL,
    repeats,
    schema: "threenative.agent-benchmark-round-prepare",
    version: 1,
  }, null, 2)}\n`, "utf8");

  return { candidates, manifestPath, ok: true, promptId: "round-5b", prompts: [...round5bPromptIds], repeats };
}

function auditAllowsRound5b(value: unknown): boolean {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.requirements)) {
    return false;
  }
  const requirements = value.requirements.filter(isRecord);
  return requirements.length === value.requirements.length
    && requirements.some((requirement) => requirement.id === "churn-budgets" && requirement.status === "complete")
    && requirements.every((requirement) => requirement.status !== "incomplete");
}

function operatorInstructions(options: { candidateDir: string; condition: BenchmarkCondition; manifestName: string; neutralHoldout?: boolean; outDir: string; promptId: string; root: string; runId: string }): string {
  const reportPath = join(options.outDir, options.runId, "run-report.json");
  const aggregatePath = join(options.outDir, "benchmark-report.json");
  const manifestPath = join(options.outDir, options.manifestName);
  const tn = options.condition === "vanilla" ? "tn" : "node bin/tn";
  return `# Round 5 Candidate ${options.runId}

## Condition

${options.condition}

## Fresh Session Rule

Start a fresh agent session for this candidate. Do not reuse transcript context
from other benchmark runs. Give the agent only \`benchmark-prompt.txt\` and the
condition notes below.

Launch the session through the benchmark-owned runner so the built workspace
CLI, neutral prompt boundary, event capture, and command cap are enforced:

\`\`\`bash
node ${join(options.root, "tools/agent-benchmark/dist/index.js")} run-session --candidate ${options.candidateDir} --condition ${options.condition} --max-tool-steps 25 --json
\`\`\`

## Condition Notes

${conditionNotes(options.condition, tn, options.runId, options.promptId, options.neutralHoldout === true)}

${options.condition === "vanilla" ? "" : "- Execute every emitted command beginning with `tn` through the project-pinned wrapper by replacing only that prefix with `node bin/tn`."}

- Treat the prepared route and assertions below as the complete public scoring
  interface. Work only in this candidate plus the plan output. Do not inspect
  parent-repository source, benchmark/scorer implementation, tests, other runs,
  or their artifacts; that is inadmissible evaluation forensics.

## Observation Route

Before visual polish, inspect the exact condition-neutral scorer-owned route in
\`benchmark-observation-route.json\`, then author the raw observer-facing state
transitions it reaches. Do not rewrite the route. It is scorer input, not a
proof result:
do not include assertion IDs, expected values, pass/fail flags, JavaScript or
eval payloads, product-specific selectors, or condition-specific hooks.

Keep bindings and actions limited to what the scorer must replay. Each route
uses generic visible or \`canvas\` bindings plus bounded keyboard, normalized
pointer, or wait actions. Preserve every emitted route ID and checkpoint name:
the scorer evaluates those exact raw samples. Author this route before polish
so it describes the real playable path rather than a post-hoc proof claim. Do
not read broad skill or reference documents to construct it.

${observationExposure(options.condition)}

${observerVocabulary(options.promptId)}

${observationRouteSemantics(options.promptId)}

The scorer owns observations and pass/fail classification for every assertion
in the ${options.promptId} equal-proof contract:

${proofChecklist(options.promptId)}

For ThreeNative candidates, the scorer imports genuinely prompt-matched
summaries under "artifacts/iterate/latest/playtest/**/summary.json". Inspect
their assertion IDs before treating them as prompt proof. When committed
scenarios do not cover the requested behavior, keep the raw observation route
current and add prompt-relevant scenarios. Do not author benchmark proof JSON
or self-assert passing screenshot evidence in either condition.

## After The Agent Stops

1. The benchmark runner writes append-only \`runner-result.json\`, normalized
   \`codex-events.jsonl\`, raw \`codex-app-events.jsonl\`, and authoritative
   \`session.json\`. Do not overwrite these files, assert a stop reason, count
   generated project files as tokens, or estimate usage from file sizes.
2. Score the candidate:

\`\`\`bash
node tools/agent-benchmark/dist/index.js score \\
  --candidate ${options.candidateDir} \\
  --condition ${options.condition} \\
  --out ${reportPath} \\
  --json
\`\`\`

3. Re-aggregate the round, inspect collection status, and run the matrix and
   NEXT-STEPS gates:

\`\`\`bash
node tools/agent-benchmark/dist/index.js aggregate --manifest ${manifestPath} --out ${aggregatePath} --json
node tools/agent-benchmark/dist/index.js status --manifest ${manifestPath} --require-complete --json
node tools/agent-benchmark/dist/index.js matrix --report ${aggregatePath} --require-typed-spec --json
node tools/agent-benchmark/dist/index.js audit --matrix-report ${aggregatePath} --session-cost tools/verify/artifacts/session-cost/verification-report.json --round-manifest ${manifestPath} --json
\`\`\`
`;
}

function conditionNotes(condition: BenchmarkCondition, tn: string, runId: string, promptId: string, neutralHoldout = false): string {
  if (neutralHoldout) {
    if (condition === "vanilla") return `- Build the requested game with plain browser Three.js. Declare the repository-pinned \`three\` dependency as \`0.181.2\` or \`^0.181.2\`, import it, render active play with \`THREE.WebGLRenderer\`, and expose that active instance as \`globalThis.__THREE_BENCHMARK_RENDERER__\`.\n- Do not use ThreeNative APIs. Implement every prepared route transition and run the package build once. Then run one bounded inline Playwright runtime smoke that fails on \`pageerror\`, console errors, or zero \`renderer.info.render.calls\`; fix a failure and rerun the build/smoke once. The scorer owns route replay: do not save browser automation, verification scripts, screenshots, or proof artifacts. Stop after the smoke passes.`;
    return `- Build the requested game with the ${condition === "typed-spec" ? "ThreeNative typed-spec" : "default ThreeNative structured-source"} condition.\n- Start with \`node bin/tn game plan --goal "$(cat benchmark-prompt.txt)" --project . --json\`. Run an emitted \`nextAuthoringCommand\` exactly when present; otherwise run the emitted \`nextInspectionCommand\` and then its \`nextAuthoringCommand\` when present. Run the mutation's emitted proof command before opening broader skills or source files.\n- Use only the prompt, the public project instructions, and the neutral proof assertions below. Stop only when current evidence covers every required assertion or the session reaches its cap.`;
  }
  const scaffoldFirst = promptId === "collector" || promptId === "lane-runner";
  const planCommand = `${tn} game plan --goal "$(cat benchmark-prompt.txt)" --project .${scaffoldFirst ? " --apply" : ""} --json`;
  const proofStop = `Stop only after every prompt behavior below is observable through prompt-matched summaries or the current raw route in \`benchmark-observation-route.json\`. Do not self-score the route. \`TN_ITERATE_OK\` alone proves only the scenarios that were run.`;
  const authoringLoop = scaffoldFirst
    ? `- Start with the prompt-derived plan: \`${planCommand}\`, then \`xvfb-run -a ${tn} iterate --project . --json\`.\n- If iterate passes the prompt proof, stop authoring. Do not run standalone build, validate, playtest, artifact inspection, or engine-source searches.`
    : `- Start with the non-mutating prompt-derived plan: \`${planCommand}\`. Inspect the planner diagnostics and each proposed mechanic's responsibilities and proof before applying anything. Apply a bounded command only when it covers the prompt's core verbs and acceptance criteria.\n- If the plan reports \`TN_GAME_PLAN_OFF_RECIPE\`, emits \`authoringMode: \"custom-on-starter\"\`, or proposes a mechanic that does not cover the requested loop, do not apply it. Run the emitted \`nextInspectionCommand\`, then custom-author the game on top of the structured-source starter through bounded scene/UI/system operations plus portable \`src/scripts/**/*.ts\` behavior.\n- After authoring a prompt-relevant vertical slice, run \`xvfb-run -a ${tn} iterate --project . --json\`. Use compact diagnostics first; inspect the prompt-matched summaries needed to establish assertion coverage. Do not run redundant standalone build/validate commands, source-wide reads, git commands, or engine-source searches.\n- ${proofStop} Fix the owning source or script and rerun until the prompt contract passes or the session reaches its token cap.`;
  if (condition === "typed-spec") {
    return `- Use ThreeNative typed-spec authoring for ${promptId}. This benchmark folder already contains operator files, so initialize the starter through a clean sibling and copy it in: \`rm -rf ../${runId}-starter-tmp && ${tn} create ../${runId}-starter-tmp --template structured-source-starter --authoring typed-spec --json && cp -R ../${runId}-starter-tmp/. . && rm -rf ../${runId}-starter-tmp\`.\n${authoringLoop}\n- If \`xvfb-run\` is unavailable, run \`${tn} iterate --project . --json\` once and stop on its first actionable diagnostic instead of retrying native proof manually.\n- Durable authored source is \`src/game.spec.ts\` plus portable scripts.`;
  }
  if (condition === "threenative") {
    return `- Use the default ThreeNative structured-source starter for ${promptId}. This benchmark folder already contains operator files, so initialize the starter through a clean sibling and copy it in: \`rm -rf ../${runId}-starter-tmp && ${tn} create ../${runId}-starter-tmp --template structured-source-starter --json && cp -R ../${runId}-starter-tmp/. . && rm -rf ../${runId}-starter-tmp\`.\n${authoringLoop}\n- If \`xvfb-run\` is unavailable, run \`${tn} iterate --project . --json\` once and stop on its first actionable diagnostic instead of retrying native proof manually.\n- Durable authored source is \`content/**/*.json\` plus portable scripts.`;
  }
  return `- Start with the same non-mutating production plan: \`${planCommand}\`. Use it only as a plan; do not use ThreeNative to author or run the game.\n- Use plain browser Three.js or vanilla web APIs only. Do not use ThreeNative APIs. Declare \`three\` as exactly \`0.181.2\` or \`^0.181.2\`, import it as \`THREE\` from \`three\`, and expose the active \`THREE.WebGLRenderer\` as \`globalThis.__THREE_BENCHMARK_RENDERER__\`.\n- The result must pass the ${promptId} equal-proof assertions listed below.\n- Include a runnable \`index.html\` or package script for the scorer.`;
}

function proofChecklist(promptId: string): string {
  const contract = getProofContract(promptId);
  return contract?.assertions.map((assertion) => `- \`${assertion.id}\`: ${assertion.description}`).join("\n") ?? "- No proof contract is registered; stop and fix benchmark preparation.";
}

export function preparedObservationRouteText(promptId: string): string {
  return `${JSON.stringify({
    promptId,
    routes: observationRoutes(promptId),
    schema: "threenative.agent-benchmark-observation-route",
    version: 1,
  }, null, 2)}\n`;
}

function observerVocabulary(promptId: string): string {
  if (promptId === "grid-push-puzzle") {
    return "Use the raw roles `player`, `grid`, `wall`, `pushable`, and `goal`, plus the visible numeric metrics `grid.goalCount` and `grid.goalTotal`. Use `active`, `success`, or `failure` for the raw phase as applicable.";
  }
  if (promptId === "wave-defense") {
    return "Use the raw roles `defender`, `enemy`, and `base`, plus the visible numeric metrics `defender.aim`, `defender.attackCount`, `wave.index`, `wave.difficulty`, `wave.enemyCount`, and `base.health`. Use `active`, `success`, or `failure` for the raw phase as applicable.";
  }
  if (promptId === "turn-based-tactics") {
    return "Use the raw roles `unit`, `enemy`, and `objective`, plus the visible numeric metrics `tactics.threat`, `tactics.objectiveProgress`, and `tactics.turn`. Use `active`, `player-turn`, `enemy-turn`, `success`, or `failure` for the raw phase as applicable.";
  }
  return "Use stable raw role and metric names that directly describe the visibly rendered game state.";
}

function observationExposure(condition: BenchmarkCondition): string {
  const shape = "A raw browser fallback exposes a zero-argument `globalThis.__TN_BENCHMARK_OBSERVE__` function returning `{ actors, metrics, phase }`. Actors use stable IDs, semantic roles, visibility, and applicable `cell`, `position`, or `selected` fields; metrics are finite numbers, booleans, or short strings. Every emitted value visibly correlates with the game, and grid cells are numeric `[column, row]` tuples. Do not return pass flags or conclusions.";
  if (condition === "vanilla") return shape;
  return `After any playtest scaffold, immediately run \`node bin/tn iterate --project . --json\` before opening source or another skill. When its prompt-matched summaries pass every exact acceptance ID below, stop: the scorer imports those summaries and browser fallback is unnecessary. Only when an assertion remains uncovered should you use the prepared raw route and add the browser fallback. ${shape}`;
}

function observationRouteSemantics(promptId: string): string {
  if (promptId === "grid-push-puzzle") {
    return "On `grid-movement`, the first Up moves the player exactly one cell and the second Up is blocked by a visible wall. On `grid-push-and-pull`, Right pushes visible crates and Left moves the player away without moving a crate. On `grid-goal-and-retry`, the two Right presses visibly advance then complete all goals, and R restores the initial active state.";
  }
  if (promptId === "wave-defense") {
    return "The control route must visibly record keyboard movement, pointer aim, and pointer attack. The progression route must advance to a later, harder wave. The failure route must reduce base health to failure before R restores active play at wave one with positive base health.";
  }
  if (promptId === "turn-based-tactics") {
    return "The control route must visibly select then move a unit. The enemy-turn route must show a distinct opponent move/threat. The success and failure routes are separate reachable outcomes, and R must restore active play after failure.";
  }
  return "Each named checkpoint must expose the literal visible state reached by its immediately preceding action.";
}

function observationRoutes(promptId: string): Array<Record<string, unknown>> {
  if (promptId === "grid-push-puzzle") {
    const bindings = rawBindings("grid", "wall", "player", "crate-a", "crate-b", "goal-a", "goal-b");
    return [
      route("grid-canvas", bindings, setupKey("KeyR"), wait("rendered", 0)),
      route("grid-movement", bindings, setupKey("KeyR"), wait("start", 0), key("moved", "ArrowUp"), key("blocked", "ArrowUp")),
      route("grid-push-and-pull", bindings, setupKey("KeyR"), wait("start", 0), key("pushed", "ArrowRight"), key("pull-attempt", "ArrowLeft")),
      route("grid-goal-and-retry", bindings, setupKey("KeyR"), wait("start", 0), key("progress", "ArrowRight"), key("complete", "ArrowRight"), key("reset", "KeyR")),
    ];
  }
  if (promptId === "wave-defense") {
    const bindings = rawBindings("defender", "enemy", "base", "wave");
    return [
      route("wave-canvas", bindings, setupKey("KeyR"), wait("rendered", 0)),
      route("wave-defender-control", bindings, setupKey("KeyR"), wait("start", 0), key("moved", "ArrowRight"), pointer("aimed", "pointer-move"), pointer("attacked", "pointer-click")),
      route("wave-progression", bindings, setupKey("KeyR"), wait("wave-one", 0), wait("wave-two", 1_000)),
      route("wave-base-failure-retry", bindings, setupKey("KeyR"), wait("healthy", 0), wait("failed", 2_000), key("reset", "KeyR")),
    ];
  }
  if (promptId === "turn-based-tactics") {
    const bindings = rawBindings("unit", "enemy", "objective", "tactics");
    return [
      route("tactics-canvas", bindings, setupKey("KeyR"), wait("rendered", 0)),
      route("tactics-unit-control", bindings, setupKey("KeyR"), wait("unselected", 0), pointer("selected", "pointer-click", 0.5, 0.5), key("moved", "ArrowRight")),
      route("tactics-enemy-turn", bindings, setupKey("KeyR"), wait("player-turn", 0), wait("opponent-moved", 1_000)),
      route("tactics-success", bindings, setupKey("KeyR"), wait("start", 0), pointer("success", "pointer-click", 0.75, 0.5)),
      route("tactics-failure-retry", bindings, setupKey("KeyR"), wait("start", 0), wait("failure", 2_000), key("reset", "KeyR")),
    ];
  }
  return [route(`${promptId}-observation`, rawBindings("player", "game"), wait("start", 0), key("input", "ArrowRight"), key("reset", "KeyR"))];
}

function rawBindings(...ids: string[]): Array<Record<string, string>> {
  return ids.map((id) => ({ id, selector: "canvas", source: "raw-snapshot" }));
}

function route(id: string, bindings: Array<Record<string, string>>, ...actions: Array<Record<string, unknown>>): Record<string, unknown> {
  return { actions, bindings, id };
}

function wait(checkpoint: string, durationMs: number): Record<string, unknown> {
  return { checkpoint, durationMs, type: "wait" };
}

function key(checkpoint: string, keyName: string): Record<string, unknown> {
  return { checkpoint, key: keyName, type: "key-press" };
}

function setupKey(keyName: string): Record<string, unknown> {
  return { key: keyName, type: "key-press" };
}

function pointer(checkpoint: string, type: "pointer-click" | "pointer-move", x = 0.5, y = 0.5): Record<string, unknown> {
  return { checkpoint, type, x, y };
}

function sessionTemplate(options: { condition: BenchmarkCondition; promptId: string; runId: string }): Record<string, unknown> {
  return {
    condition: options.condition,
    cachedInputTokens: 0,
    costWeightedTokens: 0,
    churnCounters: {
      artifactForensics: 0,
      engineSourceSearch: 0,
      failedCommand: 0,
      missingDiscovery: 0,
      missingIterate: 0,
      repeatedAssertion: 0,
      repeatedDiagnostic: 0,
      repeatedFileRead: 0,
      standaloneVerify: 0,
    },
    failedCommandCount: 0,
    humanRubric: {
      notes: "Fill after the fresh session.",
      playability: 0,
      visual: 0,
    },
    identicalAssertionRepeatCount: 0,
    inputTokens: 0,
    iterationCount: 0,
    maxConsecutiveSameDiagnostic: 0,
    outputTokens: 0,
    promptId: options.promptId,
    runId: options.runId,
    schema: "threenative.agent-benchmark-session",
    stopReason: "operator-stopped",
    tokenAccounting: "codex-turn-usage",
    tokenCount: 0,
    toolOutputBytes: 0,
    toolStepCount: 0,
    uncachedInputTokens: 0,
    version: 2,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
