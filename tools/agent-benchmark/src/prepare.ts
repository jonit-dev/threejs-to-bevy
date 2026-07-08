import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { type BenchmarkCondition } from "./types.js";

export interface IPrepareRoundOptions {
  conditions?: BenchmarkCondition[];
  outDir: string;
  promptId: string;
  promptsDir?: string;
  repeats?: number;
  root?: string;
}

export interface IPrepareRoundResult {
  candidates: Array<{
    condition: BenchmarkCondition;
    path: string;
    runId: string;
  }>;
  manifestPath: string;
  ok: boolean;
  promptId: string;
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

export async function prepareRound(options: IPrepareRoundOptions): Promise<IPrepareRoundResult> {
  const root = resolve(options.root ?? process.cwd());
  const promptsDir = resolve(root, options.promptsDir ?? "tools/agent-benchmark/prompts");
  const outDir = resolve(options.outDir);
  const promptText = await readFile(resolve(promptsDir, `${options.promptId}.md`), "utf8");
  const repeats = options.repeats ?? 3;
  const conditions = options.conditions ?? defaultConditions;
  const candidates: IPrepareRoundResult["candidates"] = [];

  for (const condition of conditions) {
    for (let index = 1; index <= repeats; index += 1) {
      const runId = `${options.promptId}-${condition}-r${index}`;
      const candidateDir = resolve(outDir, "candidates", runId);
      await mkdir(candidateDir, { recursive: true });
      await writeFile(join(candidateDir, "benchmark-prompt.txt"), promptText, "utf8");
      await writeFile(join(candidateDir, "OPERATOR.md"), operatorInstructions({
        candidateDir,
        condition,
        outDir,
        promptId: options.promptId,
        root,
        runId,
      }), "utf8");
      await writeFile(join(candidateDir, "session.template.json"), `${JSON.stringify(sessionTemplate({ condition, promptId: options.promptId, runId }), null, 2)}\n`, "utf8");
      candidates.push({ condition, path: candidateDir, runId });
    }
  }

  const manifestPath = resolve(outDir, "round-5-prepare-manifest.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    candidates,
    conditions,
    promptId: options.promptId,
    repeats,
    schema: "threenative.agent-benchmark-round-prepare",
    version: 1,
  }, null, 2)}\n`, "utf8");

  return { candidates, manifestPath, ok: true, promptId: options.promptId, repeats };
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
    for (const condition of conditions) {
      for (let index = 1; index <= repeats; index += 1) {
        const runId = `${promptId}-${condition}-r${index}`;
        const candidateDir = resolve(outDir, "candidates", runId);
        await mkdir(candidateDir, { recursive: true });
        await writeFile(join(candidateDir, "benchmark-prompt.txt"), promptText, "utf8");
        await writeFile(join(candidateDir, "OPERATOR.md"), operatorInstructions({
          candidateDir,
          condition,
          outDir,
          promptId,
          root,
          runId,
        }), "utf8");
        await writeFile(join(candidateDir, "session.template.json"), `${JSON.stringify(sessionTemplate({ condition, promptId, runId }), null, 2)}\n`, "utf8");
        candidates.push({ condition, path: candidateDir, runId });
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
    repeats,
    schema: "threenative.agent-benchmark-round-prepare",
    version: 1,
  }, null, 2)}\n`, "utf8");

  return { candidates, manifestPath, ok: true, promptId: "round-5b", repeats };
}

function auditAllowsRound5b(value: unknown): boolean {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.requirements)) {
    return false;
  }
  return value.requirements.every((requirement) => isRecord(requirement) && requirement.status !== "incomplete");
}

function operatorInstructions(options: { candidateDir: string; condition: BenchmarkCondition; outDir: string; promptId: string; root: string; runId: string }): string {
  const reportPath = join(options.outDir, options.runId, "run-report.json");
  const aggregatePath = join(options.outDir, "benchmark-report.json");
  const manifestPath = join(options.outDir, "round-5-prepare-manifest.json");
  const tn = `node ${join(options.root, "packages/cli/dist/index.js")}`;
  return `# Round 5 Candidate ${options.runId}

## Condition

${options.condition}

## Fresh Session Rule

Start a fresh agent session for this candidate. Do not reuse transcript context
from other benchmark runs. Give the agent only \`benchmark-prompt.txt\` and the
condition notes below.

## Condition Notes

${conditionNotes(options.condition, tn, options.runId)}

## Required Proof Artifacts

Before stopping, leave committed playtest or browser-proof artifacts under this
candidate showing:

- keyboard movement passed,
- "GameState.scoreText" reaches "Score 5 / 5",
- "GameState.statusText" reaches win text that mentions retry,
- the retry path can reset or restart the game.

For ThreeNative candidates, prefer "tn playtest" scenario summaries under
"artifacts/playtest/**/summary.json" because the scorer imports those directly.
For vanilla candidates, write a browser-driven proof artifact at
"artifacts/proof/collector-proof.json" with this schema:

\`\`\`json
{
  "schema": "threenative.agent-benchmark-proof",
  "promptId": "${options.promptId}",
  "assertions": [
    { "id": "keyboard-movement", "pass": true, "details": { "evidence": "actual keyboard/browser run" } },
    { "id": "pickup-objective", "pass": true, "details": { "scoreText": "Score 5 / 5" } },
    { "id": "win-state", "pass": true, "details": { "statusText": "All pickups collected - press R to retry" } },
    { "id": "retry-path", "pass": true, "details": { "resetScoreText": "Score 0 / 5" } }
  ]
}
\`\`\`

## After The Agent Stops

1. Write \`session.json\` from \`session.template.json\` with the real token
   counts, tool-step counts, failed-command counts, stop reason, and human
   rubric.
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
node tools/agent-benchmark/dist/index.js aggregate --runs ${options.outDir} --out ${aggregatePath} --json
node tools/agent-benchmark/dist/index.js status --manifest ${manifestPath} --require-complete --json
node tools/agent-benchmark/dist/index.js matrix --report ${aggregatePath} --require-typed-spec --json
node tools/agent-benchmark/dist/index.js audit --matrix-report ${aggregatePath} --session-cost tools/verify/artifacts/session-cost/verification-report.json --round-manifest ${manifestPath} --json
\`\`\`
`;
}

function conditionNotes(condition: BenchmarkCondition, tn: string, runId: string): string {
  if (condition === "typed-spec") {
    return `- Use ThreeNative typed-spec authoring. This benchmark folder already contains operator files, so initialize the starter through a clean sibling and copy it in: \`rm -rf ../${runId}-starter-tmp && ${tn} create ../${runId}-starter-tmp --template structured-source-starter --authoring typed-spec --json && cp -R ../${runId}-starter-tmp/. . && rm -rf ../${runId}-starter-tmp\`.\n- Run the scaffold-first path exactly: \`${tn} game plan --goal "collector" --project . --apply --json\`, then \`xvfb-run -a ${tn} iterate --project . --json\`.\n- If that iterate command passes, stop authoring. Do not run standalone build, validate, playtest, artifact inspection, or engine-source searches; the generated playtests are the required proof artifacts.\n- If \`xvfb-run\` is unavailable, run \`${tn} iterate --project . --json\` once and stop on its first actionable diagnostic instead of retrying native proof manually.\n- Durable authored source is \`src/game.spec.ts\` plus portable scripts.`;
  }
  if (condition === "threenative") {
    return `- Use the default ThreeNative structured-source starter. This benchmark folder already contains operator files, so initialize the starter through a clean sibling and copy it in: \`rm -rf ../${runId}-starter-tmp && ${tn} create ../${runId}-starter-tmp --template structured-source-starter --json && cp -R ../${runId}-starter-tmp/. . && rm -rf ../${runId}-starter-tmp\`.\n- Run the scaffold-first path exactly: \`${tn} game plan --goal "collector" --project . --apply --json\`, then \`xvfb-run -a ${tn} iterate --project . --json\`.\n- If that iterate command passes, stop authoring. Do not run standalone build, validate, playtest, artifact inspection, or engine-source searches; the generated playtests are the required proof artifacts.\n- If \`xvfb-run\` is unavailable, run \`${tn} iterate --project . --json\` once and stop on its first actionable diagnostic instead of retrying native proof manually.\n- Durable authored source is \`content/**/*.json\` plus portable scripts.`;
  }
  return "- Use plain browser Three.js or vanilla web APIs only. Do not use ThreeNative APIs.\n- The result must still pass the same round-5 equal-proof collector assertions.\n- Include a runnable `index.html` or package script for the scorer.";
}

function sessionTemplate(options: { condition: BenchmarkCondition; promptId: string; runId: string }): Record<string, unknown> {
  return {
    condition: options.condition,
    cachedInputTokens: 0,
    costWeightedTokens: 0,
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
