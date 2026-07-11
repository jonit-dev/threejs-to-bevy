import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { bakeGiBundle, buildProject, generateProjectTypes, type IBakeGiBundleResult } from "@threenative/compiler";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { normalizeArgv, readFlag } from "./sourceCommandUtils.js";

interface IBakeGiDependencies {
  bake(bundlePath: string, options: { maxDistance?: number; rayCount?: number; seed?: number }): Promise<IBakeGiBundleResult>;
  build(projectPath: string): Promise<{ bundlePath: string }>;
  generateTypes(options: { projectPath: string }): Promise<unknown>;
}

const defaultDependencies: IBakeGiDependencies = { bake: bakeGiBundle, build: buildProject, generateTypes: generateProjectTypes };

export async function bakeGiCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd(), dependencies: IBakeGiDependencies = defaultDependencies): Promise<ICommandResult> {
  const normalized = normalizeArgv(argv);
  const json = normalized.includes("--json");
  if (normalized[0] !== "gi") return diagnosticResult({ code: "TN_BAKE_COMMAND_UNKNOWN", message: "Usage: tn bake gi [--ray-count <n>] [--seed <n>] [--max-distance <n>] [--project <path>] [--json]" }, { exitCode: 1, json, stderr: true });
  const projectPath = resolve(cwd, readFlag(normalized, "--project") ?? ".");
  const rayCount = finiteNumberFlag(normalized, "--ray-count");
  const seed = finiteNumberFlag(normalized, "--seed");
  const maxDistance = finiteNumberFlag(normalized, "--max-distance");
  if (rayCount === null || seed === null || maxDistance === null) return diagnosticResult({ code: "TN_BAKE_GI_FLAG_INVALID", message: "GI bake numeric flags must be finite numbers." }, { exitCode: 1, json, stderr: true });

  try {
    const startedAt = performance.now();
    await dependencies.generateTypes({ projectPath });
    const { bundlePath } = await dependencies.build(projectPath);
    const result = await dependencies.bake(bundlePath, {
      ...(maxDistance === undefined ? {} : { maxDistance }),
      ...(rayCount === undefined ? {} : { rayCount }),
      ...(seed === undefined ? {} : { seed }),
    });
    const environmentId = await findEnvironmentId(projectPath);
    const relativePath = `content/lighting/${environmentId}.probes.json`;
    const outputPath = resolve(projectPath, relativePath);
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({
      probes: result.probes,
      sceneContentHash: result.sceneContentHash,
      sceneId: environmentId,
      schema: "threenative.baked-probes",
      version: "0.1.0",
    }, null, 2)}\n`, "utf8");
    const embeddedBuild = await dependencies.build(projectPath);
    const payload = {
      bundlePath: embeddedBuild.bundlePath,
      code: "TN_BAKE_GI_OK",
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      filesWritten: [relativePath],
      hitCount: result.hitCount,
      probeCount: result.probes.length,
      rayCount: result.rayCount,
      sceneContentHash: result.sceneContentHash,
      seed: result.seed,
      unsupportedMeshIds: result.unsupportedMeshIds,
    };
    return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `Baked ${payload.probeCount} GI probe(s) to '${relativePath}' with ${payload.rayCount} rays.\n` };
  } catch (error) {
    return diagnosticResult({ code: "TN_BAKE_GI_FAILED", message: error instanceof Error ? error.message : String(error), suggestedFix: "Author at least one light probe, ensure static mesh assets are buildable, then rerun 'tn bake gi --project . --json'." }, { exitCode: 1, json, stderr: true });
  }
}

async function findEnvironmentId(projectPath: string): Promise<string> {
  const directory = resolve(projectPath, "content/environment");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".environment.json")).sort();
  if (files.length !== 1) throw new Error(`GI baking requires exactly one content/environment/*.environment.json document; found ${files.length}.`);
  const path = resolve(directory, files[0]!);
  const document = JSON.parse(await readFile(path, "utf8")) as { id?: unknown };
  return typeof document.id === "string" && document.id.trim() !== "" ? document.id : basename(path, ".environment.json");
}

function finiteNumberFlag(argv: readonly string[], flag: string): number | null | undefined {
  const raw = readFlag(argv, flag);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
