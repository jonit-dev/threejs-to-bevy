import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { runBlenderGenerator } from "@threenative/cli";

import type { VerificationDiagnostic } from "./runner.js";

export async function runGeneratorRerunGate(options: { reportPath?: string; root?: string } = {}): Promise<{
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/generator-rerun/verification-report.json");
  const projectPath = await mkdtemp(join(tmpdir(), "tn-generator-rerun-gate-"));
  const diagnostics: VerificationDiagnostic[] = [];
  try {
    await mkdir(join(projectPath, "content/generators"), { recursive: true });
    const recipePath = join(projectPath, "content/generators/aircraft.recipe.json");
    const provenancePath = join(projectPath, "content/generators/aircraft.generator.json");
    await writeFile(recipePath, `${JSON.stringify(recipe(["idle", "wave"], "idle"), null, 2)}\n`);
    await writeFile(provenancePath, `${JSON.stringify({
      id: "aircraft",
      outputs: ["assets/generated/aircraft.glb"],
      overwritePolicy: "replace",
      provider: "blender",
      providerVersion: "4.5.11",
      recipe: "content/generators/aircraft.recipe.json",
      schema: "threenative.generator-provenance",
      version: "0.1.0",
    }, null, 2)}\n`);

    const dependencies = fakeBlenderDependencies(recipePath);
    const first = await runBlenderGenerator({ generatorId: "aircraft", projectPath }, dependencies);
    if (!first.ok) throw new Error(first.diagnostics.map((row) => `${row.code}: ${row.message}`).join("; "));

    const assetPath = join(projectPath, "content/assets/aircraft.assets.json");
    const asset = JSON.parse(await readFile(assetPath, "utf8")) as {
      assets: Array<{ animationGraph: { states: Array<Record<string, unknown>> }; animations: Array<Record<string, unknown>> }>;
    };
    asset.assets[0]!.animations.push({ id: "authored.inspect", sourceClip: "inspect" });
    asset.assets[0]!.animationGraph.states.push({ clip: "authored.inspect", id: "authored.inspect" });
    await writeFile(assetPath, `${JSON.stringify(asset, null, 2)}\n`);
    await writeFile(recipePath, `${JSON.stringify(recipe(["dive"], "dive"), null, 2)}\n`);

    const second = await runBlenderGenerator({ generatorId: "aircraft", projectPath }, dependencies);
    if (!second.ok) throw new Error(second.diagnostics.map((row) => `${row.code}: ${row.message}`).join("; "));
    const reconciled = JSON.parse(await readFile(assetPath, "utf8")) as {
      assets: Array<{ animationGraph: { initialState: string; states: Array<{ id: string }> }; animations: Array<{ id: string }> }>;
    };
    const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as { animationIds: string[]; overwritePolicy: string };
    const observed = {
      animationIds: provenance.animationIds,
      animations: reconciled.assets[0]!.animations.map((row) => row.id),
      firstOutputHash: first.outputHash,
      initialState: reconciled.assets[0]!.animationGraph.initialState,
      overwritePolicy: provenance.overwritePolicy,
      secondOutputHash: second.outputHash,
      states: reconciled.assets[0]!.animationGraph.states.map((row) => row.id),
    };
    if (JSON.stringify(observed.animations) !== JSON.stringify(["authored.inspect", "dive"])) diagnostics.push(failure("TN_VERIFY_GENERATOR_RERUN_ANIMATIONS", "Rerun did not remove stale generated clips while preserving authored rows."));
    if (JSON.stringify(observed.states) !== JSON.stringify(["authored.inspect", "dive"]) || observed.initialState !== "dive") diagnostics.push(failure("TN_VERIFY_GENERATOR_RERUN_GRAPH", "Rerun did not exactly reconcile graph states and explicit initial state."));
    if (observed.overwritePolicy !== "replace" || JSON.stringify(observed.animationIds) !== JSON.stringify(["dive"])) diagnostics.push(failure("TN_VERIFY_GENERATOR_RERUN_PROVENANCE", "Rerun did not preserve policy and advance owned animation ids."));

    const ok = diagnostics.length === 0;
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify({
      code: ok ? "TN_VERIFY_GENERATOR_RERUN_OK" : "TN_VERIFY_GENERATOR_RERUN_FAILED",
      diagnostics,
      generatedBy: "@threenative/verify-tools generatorRerunGate",
      observed,
      ok,
      schema: "threenative.verify.generator-rerun",
      status: ok ? "pass" : "fail",
      version: "0.1.0",
    }, null, 2)}\n`);
    return { diagnostics, ok, reportPath };
  } catch (error) {
    diagnostics.push(failure("TN_VERIFY_GENERATOR_RERUN_EXECUTION", error instanceof Error ? error.message : String(error)));
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify({ diagnostics, ok: false, schema: "threenative.verify.generator-rerun", status: "fail", version: "0.1.0" }, null, 2)}\n`);
    return { diagnostics, ok: false, reportPath };
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
}

function recipe(ids: string[], initialAnimation: string): Record<string, unknown> {
  return {
    animations: ids.map((id) => ({ duration: 1, id, loop: true, tracks: [{ keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 0, 1] }], node: "body", property: "position" }] })),
    budgets: { maxAnimations: 4, maxKeyframesPerTrack: 8, maxMaterials: 2, maxModifiersPerPart: 2, maxOutputBytes: 100_000, maxParts: 4, maxPolygons: 1_000, maxSegments: 8, maxTracksPerAnimation: 4 },
    id: "aircraft",
    initialAnimation,
    parts: [{ id: "body", primitive: "cube" }],
    schema: "threenative.blender-recipe",
    version: "0.1.0",
  };
}

function fakeBlenderDependencies(recipePath: string) {
  return {
    inspect: async (path: string) => {
      const current = JSON.parse(await readFile(recipePath, "utf8")) as { animations: Array<{ id: string }> };
      return {
        animationClips: current.animations.map((row) => ({ channels: 1, name: row.id, samplers: 1 })),
        code: "TN_ASSET_INSPECT_OK" as const,
        counts: { animations: current.animations.length, materials: 0, meshes: 1, triangles: 12 },
        diagnostics: [],
        file: { byteSize: 32, path },
      };
    },
    now: () => new Date("2026-07-24T00:00:00.000Z"),
    runProcess: async (_executable: string, args: readonly string[]) => {
      const job = JSON.parse(await readFile(args.at(-1)!, "utf8")) as { outputPath: string; resultPath: string };
      const current = JSON.parse(await readFile(recipePath, "utf8")) as { animations: Array<{ id: string }> };
      await writeFile(job.outputPath, `generated:${current.animations.map((row) => row.id).join(",")}`);
      await writeFile(job.resultPath, `${JSON.stringify({ animations: current.animations.map((row) => row.id), nodes: ["body"], ok: true })}\n`);
      return { exitCode: 0, stderr: "", stdout: "", timedOut: false };
    },
    toolStatus: async () => ({
      artifact: { archive: "tar.xz" as const, archiveFile: "blender.tar.xz", executablePath: "blender", expectedBytes: 1, host: "linux-x64" as const, sha256: "0".repeat(64), url: "https://download.blender.org/blender.tar.xz" },
      cachePath: "/managed",
      code: "TN_EXTERNAL_TOOL_READY" as const,
      executablePath: "/managed/blender",
      id: "blender" as const,
      license: { name: "GPL", url: "https://developer.blender.org/docs/license/" },
      ready: true as const,
      source: "managed" as const,
      sourceUrl: "https://download.blender.org/source/",
      version: "4.5.11",
    }),
    uniqueId: () => "gate",
  };
}

function failure(code: string, message: string): VerificationDiagnostic {
  return { code, message, severity: "error", suggestedFix: "Inspect the generator rerun verification report and fix the owning provenance or reconciliation path." };
}

if (process.argv[1]?.endsWith("generatorRerunGate.js")) {
  const result = await runGeneratorRerunGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
