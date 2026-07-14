import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { assetCommand, authoringCommand, buildCommand, EXTERNAL_TOOL_REGISTRY, externalToolHost, toolCommand } from "@threenative/cli";

import { runBlenderToolGate } from "./blenderToolGate.js";

interface IGeneratorResult {
  code?: string;
  execution?: { argv: string[]; cwd: string; executable: string; exitCode: number; peakMemoryBytes?: number; timedOut: boolean; timeoutMs: number };
  inspection?: { bounds?: { max: number[]; min: number[] }; counts?: { materials?: number; meshes?: number; triangles?: number } };
  ok?: boolean;
  outputHash?: string;
}

interface ICommandResult { exitCode: number; stdout: string }

const baselines = {
  "prop.barrier": { materials: 4, meshes: 12, triangles: 1584 },
  "prop.crate": { materials: 3, meshes: 14, triangles: 168 },
  "prop.pickup": { materials: 3, meshes: 11, triangles: 2398 },
} as const;
const execFile = promisify(execFileCallback);

async function main(): Promise<void> {
  const startedAt = Date.now();
  const projectPath = await mkdtemp(join(tmpdir(), "tn-blender-host-smoke-"));
  const recipesPath = resolve("tools/verify/evidence/blender-recipes");
  const reportPath = resolve(process.argv[2] ?? "tools/verify/artifacts/blender-tool/host-smoke-report.json");
  const recipes: Array<Record<string, unknown>> = [];
  try {
    const host = externalToolHost();
    if (host === undefined) throw new Error(`TN_VERIFY_BLENDER_HOST_SMOKE_FAILED: unsupported host '${process.platform}-${process.arch}'.`);
    const installStartedAt = Date.now();
    const installCommand = await toolCommand(["install", "blender", "--accept-download", "--json"]) as ICommandResult;
    const installDurationMs = Math.max(1, Date.now() - installStartedAt);
    const statusCommand = await toolCommand(["status", "blender", "--json"]) as ICommandResult;
    const tool = JSON.parse(statusCommand.stdout) as { artifact?: { expectedBytes?: number; sha256?: string; url?: string }; cachePath?: string; executablePath?: string; ready?: boolean; source?: string; version?: string; versionOutput?: string };
    const manifest = EXTERNAL_TOOL_REGISTRY.blender.artifacts[host];
    if (installCommand.exitCode !== 0 || statusCommand.exitCode !== 0 || tool.ready !== true || tool.source !== "managed" || tool.artifact?.url !== manifest.url || tool.artifact.sha256 !== manifest.sha256 || tool.version !== EXTERNAL_TOOL_REGISTRY.blender.version || !tool.cachePath || !tool.executablePath) throw new Error("TN_VERIFY_BLENDER_HOST_SMOKE_FAILED: managed Blender install/status does not match the owning manifest.");
    await cp(resolve("templates/structured-source-starter"), projectPath, { recursive: true });
    await mkdir(join(projectPath, "content/generators"), { recursive: true });
    for (const [id, baseline] of Object.entries(baselines)) {
      const recipeName = `${id}.recipe.json`;
      await cp(join(recipesPath, recipeName), join(projectPath, "content/generators", recipeName));
      const recipeStartedAt = Date.now();
      const command = await assetCommand(["generate", id, "--provider", "blender", "--recipe", `content/generators/${recipeName}`, "--project", projectPath, "--json"]) as ICommandResult;
      const result = JSON.parse(command.stdout) as IGeneratorResult;
      const counts = result.inspection?.counts;
      const execution = result.execution;
      const argv = execution?.argv ?? [];
      const runnerPath = argv[6] ?? "";
      const jobPath = argv[9] ?? "";
      const exactPrefix = ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python"];
      const executionValid = argv.length === 10 && JSON.stringify(argv.slice(0, 6)) === JSON.stringify(exactPrefix) && argv[7] === "--" && argv[8] === "--job" && dirname(jobPath) === execution?.cwd && execution.executable === tool.executablePath && execution.exitCode === 0 && execution.timedOut === false && execution.timeoutMs === 120_000 && (execution.peakMemoryBytes ?? 0) > 0;
      if (command.exitCode !== 0 || result.ok !== true || result.code !== "TN_ASSET_GENERATE_OK" || counts?.materials !== baseline.materials || counts.meshes !== baseline.meshes || counts.triangles !== baseline.triangles || !/^sha256:[a-f0-9]{64}$/u.test(result.outputHash ?? "") || !executionValid) {
        throw new Error(`TN_VERIFY_BLENDER_HOST_SMOKE_FAILED: '${id}' did not match its semantic baseline: ${JSON.stringify({ exitCode: command.exitCode, code: result.code, counts, outputHash: result.outputHash })}`);
      }
      const outputPath = join(projectPath, "assets/generated", `${id}.glb`);
      recipes.push({ id, ...baseline, bounds: result.inspection?.bounds, byteSize: (await stat(outputPath)).size, durationMs: Date.now() - recipeStartedAt, execution, outputHash: result.outputHash, runnerSha256: createHash("sha256").update(await readFile(runnerPath)).digest("hex"), workDirectoryRemoved: !(await pathExists(execution.cwd)) });
    }
    const authoring = await authoringCommand(["validate", "--project", projectPath, "--json"]) as ICommandResult;
    const build = await buildCommand(["--project", projectPath, "--json"]) as ICommandResult;
    const cleanup = {
      noLocks: !(await pathExists(`${tool.cachePath}.lock`)),
      noProcesses: !(await managedProcessRunning(tool.executablePath)),
      noStaging: (await readdir(join(projectPath, "assets/generated"))).every((name) => !name.includes(".staging-") && !name.includes(".backup-")),
      noWorkDirectories: recipes.every((row) => row.workDirectoryRemoved === true),
    };
    const report = {
      arch: process.arch, authoringValid: authoring.exitCode === 0, buildPassed: build.exitCode === 0,
      cleanup,
      code: "TN_VERIFY_BLENDER_HOST_SMOKE_OK", durationMs: Date.now() - startedAt, host, manifest,
      metrics: { archiveBytes: manifest.expectedBytes, cacheBytes: await directoryBytes(tool.cachePath), installDurationMs, peakChildMemoryBytes: Math.max(...recipes.map((row) => Number((row.execution as { peakMemoryBytes?: number }).peakMemoryBytes ?? 0))) },
      ok: true, platform: process.platform, recipes, runnerSha256: recipes[0]?.runnerSha256,
      schema: "threenative.verify.blender-host-smoke", tool: { executablePath: tool.executablePath, source: tool.source, version: tool.version, versionOutput: tool.versionOutput }, version: "0.1.0",
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const gate = await runBlenderToolGate({ evidencePath: "tools/verify/evidence/blender-tool.json", hostReportPath: reportPath });
    if (!gate.ok) throw new Error(`TN_VERIFY_BLENDER_HOST_SMOKE_FAILED: lifecycle gate rejected host report: ${JSON.stringify(gate.diagnostics)}`);
    process.stdout.write(`${JSON.stringify({ ...report, lifecycleReportPath: gate.reportPath, reportPath }, null, 2)}\n`);
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
}

async function pathExists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

async function managedProcessRunning(executablePath: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const escaped = executablePath.replaceAll("'", "''");
      const { stdout } = await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${escaped}' } | Select-Object -ExpandProperty ProcessId`]);
      return stdout.trim() !== "";
    }
    const { stdout } = await execFile("ps", ["-ax", "-o", "command="]);
    return stdout.split(/\r?\n/u).some((line) => line.includes(executablePath));
  } catch {
    return true;
  }
}

async function directoryBytes(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    total += entry.isDirectory() ? await directoryBytes(child) : (await stat(child)).size;
  }
  return total;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
