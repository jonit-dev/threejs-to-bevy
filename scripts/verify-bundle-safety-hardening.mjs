import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targets = resolveArtifactTargets({ gate: "bundle-safety-hardening", owner: { kind: "aggregate", name: "bundle-safety-hardening" }, root });
const artifactRoot = targets.absoluteDir;
const reportPath = resolve(artifactRoot, "verification-report.json");

const commands = [
  {
    args: ["--filter", "@threenative/ir", "test", "--", "--run", "bundle path"],
    command: "pnpm",
    name: "ir bundle path validation",
  },
  {
    args: ["--filter", "@threenative/compiler", "test", "--", "--run", "scatter|preserve previous bundle|clean temporary emit directory"],
    command: "pnpm",
    name: "compiler atomic emit and scatter budgets",
  },
  {
    args: ["--filter", "@threenative/runtime-web-three", "test", "--", "--run", "render"],
    command: "pnpm",
    name: "web render lifecycle robustness",
  },
  {
    args: ["--filter", "@threenative/cli", "test", "--", "--run", "editor snapshot should reject unsafe|package should reject invalid"],
    command: "pnpm",
    name: "cli bundle path safety",
  },
  {
    args: ["test", "--manifest-path", "runtime-bevy/Cargo.toml", "-p", "threenative_loader", "--test", "load_bundle"],
    command: "cargo",
    name: "bevy loader path and payload safety",
  },
];

await mkdir(artifactRoot, { recursive: true });

const startedAt = new Date();
const results = [];
for (const step of commands) {
  const startedAtMs = Date.now();
  const result = spawnSync(step.command, step.args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
  });
  results.push({
    args: step.args,
    command: step.command,
    durationMs: Date.now() - startedAtMs,
    exitCode: result.status ?? 1,
    name: step.name,
    stderr: trimOutput(result.stderr),
    stdout: trimOutput(result.stdout),
  });
  if (result.status !== 0) {
    break;
  }
}

const ok = results.length === commands.length && results.every((result) => result.exitCode === 0);
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      artifacts: { report: targets.reportPath },
      commands: results,
      ok,
      promoted: [
        "bundle-relative-path-validation",
        "atomic-compiler-emit",
        "generated-payload-length-validation",
        "web-render-loop-disposal",
        "environment-scatter-budget",
        "cli-editor-package-path-safety",
      ],
      schema: "threenative.bundle-safety-hardening-report",
      startedAt: startedAt.toISOString(),
      status: ok ? "passed" : "failed",
      version: "0.1.0",
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}

function trimOutput(value) {
  const text = value?.trim() ?? "";
  return text.length > 8000 ? `${text.slice(0, 8000)}\n... truncated ...` : text;
}
