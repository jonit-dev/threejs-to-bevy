import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getProofContract } from "./proof-contract.js";
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
        manifestName: "round-5-prepare-manifest.json",
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
          manifestName: "round-5b-prepare-manifest.json",
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
  const requirements = value.requirements.filter(isRecord);
  return requirements.length === value.requirements.length
    && requirements.some((requirement) => requirement.id === "churn-budgets" && requirement.status === "complete")
    && requirements.every((requirement) => requirement.status !== "incomplete");
}

function operatorInstructions(options: { candidateDir: string; condition: BenchmarkCondition; manifestName: string; outDir: string; promptId: string; root: string; runId: string }): string {
  const reportPath = join(options.outDir, options.runId, "run-report.json");
  const aggregatePath = join(options.outDir, "benchmark-report.json");
  const manifestPath = join(options.outDir, options.manifestName);
  const tn = `node ${join(options.root, "packages/cli/dist/index.js")}`;
  return `# Round 5 Candidate ${options.runId}

## Condition

${options.condition}

## Fresh Session Rule

Start a fresh agent session for this candidate. Do not reuse transcript context
from other benchmark runs. Give the agent only \`benchmark-prompt.txt\` and the
condition notes below.

## Condition Notes

${conditionNotes(options.condition, tn, options.runId, options.promptId)}

## Required Proof Artifacts

Before stopping, leave playtest or browser-proof artifacts under this candidate
for every assertion in the ${options.promptId} equal-proof contract:

${proofChecklist(options.promptId)}

For ThreeNative candidates, the scorer imports genuinely prompt-matched
summaries under "artifacts/iterate/latest/playtest/**/summary.json". Inspect
their assertion IDs before treating them as prompt proof. When committed
scenarios do not cover every required ID below, either add prompt-specific
scenarios or leave a browser-driven neutral proof artifact. Vanilla candidates
must also leave a browser-driven neutral proof artifact at
"artifacts/proof/${options.promptId}-proof.json" using this schema:

\`\`\`json
${neutralProofExample(options.promptId)}
\`\`\`

## After The Agent Stops

1. Capture \`session.json\` from the agent's authoritative usage events. Do
   not count generated project JSON/source or estimate from file sizes:

\`\`\`bash
node tools/agent-benchmark/dist/index.js capture-session --events ${options.candidateDir}/codex-events.jsonl --template ${options.candidateDir}/session.template.json --out ${options.candidateDir}/session.json --stop-reason claimed-playable --json
\`\`\`

   Add the observed human rubric with \`--playability\`, \`--visual\`, and
   \`--notes\` when scoring the final matrix.
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

function conditionNotes(condition: BenchmarkCondition, tn: string, runId: string, promptId: string): string {
  const scaffoldFirst = promptId === "collector" || promptId === "lane-runner";
  const planCommand = `${tn} game plan --goal "$(cat benchmark-prompt.txt)" --project .${scaffoldFirst ? " --apply" : ""} --json`;
  const proofStop = `Stop only after every prompt assertion below has an actual browser or playtest observation in prompt-matched summaries or \`artifacts/proof/${promptId}-proof.json\`. \`TN_ITERATE_OK\` alone proves only the scenarios that were run.`;
  const authoringLoop = scaffoldFirst
    ? `- Start with the prompt-derived plan: \`${planCommand}\`, then \`xvfb-run -a ${tn} iterate --project . --json\`.\n- If iterate passes the prompt proof, stop authoring. Do not run standalone build, validate, playtest, artifact inspection, or engine-source searches.`
    : `- Start with the non-mutating prompt-derived plan: \`${planCommand}\`. Inspect the planner diagnostics and each proposed mechanic's responsibilities and proof before applying anything. Apply a bounded command only when it covers the prompt's core verbs and acceptance criteria.\n- If the plan reports \`TN_GAME_PLAN_OFF_RECIPE\`, emits \`authoringMode: \"custom-on-starter\"\`, or proposes a mechanic that does not cover the requested loop, do not apply it. Run the emitted \`nextInspectionCommand\`, then custom-author the game on top of the structured-source starter through bounded scene/UI/system operations plus portable \`src/scripts/**/*.ts\` behavior.\n- After authoring a prompt-relevant vertical slice, run \`xvfb-run -a ${tn} iterate --project . --json\`. Use compact diagnostics first; inspect the prompt-matched summaries needed to establish assertion coverage. Do not run redundant standalone build/validate commands, source-wide reads, git commands, or engine-source searches.\n- ${proofStop} Fix the owning source or script and rerun until the prompt contract passes or the session reaches its token cap.`;
  if (condition === "typed-spec") {
    return `- Use ThreeNative typed-spec authoring for ${promptId}. This benchmark folder already contains operator files, so initialize the starter through a clean sibling and copy it in: \`rm -rf ../${runId}-starter-tmp && ${tn} create ../${runId}-starter-tmp --template structured-source-starter --authoring typed-spec --json && cp -R ../${runId}-starter-tmp/. . && rm -rf ../${runId}-starter-tmp\`.\n${authoringLoop}\n- If \`xvfb-run\` is unavailable, run \`${tn} iterate --project . --json\` once and stop on its first actionable diagnostic instead of retrying native proof manually.\n- Durable authored source is \`src/game.spec.ts\` plus portable scripts.`;
  }
  if (condition === "threenative") {
    return `- Use the default ThreeNative structured-source starter for ${promptId}. This benchmark folder already contains operator files, so initialize the starter through a clean sibling and copy it in: \`rm -rf ../${runId}-starter-tmp && ${tn} create ../${runId}-starter-tmp --template structured-source-starter --json && cp -R ../${runId}-starter-tmp/. . && rm -rf ../${runId}-starter-tmp\`.\n${authoringLoop}\n- If \`xvfb-run\` is unavailable, run \`${tn} iterate --project . --json\` once and stop on its first actionable diagnostic instead of retrying native proof manually.\n- Durable authored source is \`content/**/*.json\` plus portable scripts.`;
  }
  return `- Start with the same non-mutating production plan: \`${planCommand}\`. Use it only as a plan; do not use ThreeNative to author or run the game.\n- Use plain browser Three.js or vanilla web APIs only. Do not use ThreeNative APIs.\n- The result must pass the ${promptId} equal-proof assertions listed below.\n- Include a runnable \`index.html\` or package script for the scorer.`;
}

function proofChecklist(promptId: string): string {
  const contract = getProofContract(promptId);
  return contract?.assertions.map((assertion) => `- \`${assertion.id}\`: ${assertion.description}`).join("\n") ?? "- No proof contract is registered; stop and fix benchmark preparation.";
}

function neutralProofExample(promptId: string): string {
  const contract = getProofContract(promptId);
  return JSON.stringify({ assertions: contract?.assertions.map((assertion) => ({ details: { evidence: "actual browser/playtest observation" }, id: assertion.id, pass: true })) ?? [], promptId, schema: "threenative.agent-benchmark-proof" }, null, 2);
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
