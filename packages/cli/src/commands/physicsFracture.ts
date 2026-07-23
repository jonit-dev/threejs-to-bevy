import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { bakeFractureManifest, type IFractureBakeInput } from "@threenative/compiler";
import { validateFractureManifest, type IFractureManifest } from "@threenative/ir";
import type { ICommandResult } from "../diagnostics.js";

export async function physicsFractureCommand(argv: readonly string[], options: { cwd?: string } = {}): Promise<ICommandResult> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const [action, positional] = args.filter((value, index) => !value.startsWith("--") && !valueFlag(args[index - 1]));
  const json = args.includes("--json");
  const project = resolve(options.cwd ?? process.cwd(), readFlag(args, "--project") ?? ".");
  try {
    if (action === "generate") {
      const id = readFlag(args, "--id") ?? positional;
      const recipeValue = readFlag(args, "--recipe");
      if (id === undefined || recipeValue === undefined) return fail("TN_PHYSICS_FRACTURE_ARGS_MISSING", usage(), json);
      const recipe = await readJsonValue(recipeValue, project);
      const seed = numberFlag(args, "--seed", 0);
      const input: IFractureBakeInput = { id, recipe: recipe as IFractureBakeInput["recipe"], seed };
      const maxActivePieces = optionalNumberFlag(args, "--max-active-pieces");
      const maxDepth = optionalNumberFlag(args, "--max-depth");
      const overflowPolicy = readFlag(args, "--overflow-policy") as IFractureBakeInput["overflowPolicy"];
      if (maxActivePieces !== undefined) input.maxActivePieces = maxActivePieces;
      if (maxDepth !== undefined) input.maxDepth = maxDepth;
      if (overflowPolicy !== undefined) input.overflowPolicy = overflowPolicy;
      const result = bakeFractureManifest(input);
      if (result.diagnostics.some(({ severity }) => severity === "error")) return payload({ code: "TN_PHYSICS_FRACTURE_INVALID", diagnostics: result.diagnostics, ok: false }, 1, json);
      const output = contained(project, readFlag(args, "--out") ?? `content/fractures/${id}.json`);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, result.json, "utf8");
      return payload({ code: "TN_PHYSICS_FRACTURE_GENERATED", hash: result.hash, manifest: relative(project, output), ok: true, pieceCount: result.manifest.pieces.length, bondCount: result.manifest.bonds.length }, 0, json);
    }
    if (action === "inspect" || action === "validate") {
      if (positional === undefined) return fail("TN_PHYSICS_FRACTURE_ARGS_MISSING", usage(), json);
      const path = contained(project, positional);
      const manifest = JSON.parse(await readFile(path, "utf8")) as IFractureManifest;
      const diagnostics = validateFractureManifest(manifest, relative(project, path));
      const ok = !diagnostics.some(({ severity }) => severity === "error");
      return payload({ code: ok ? `TN_PHYSICS_FRACTURE_${action.toUpperCase()}_OK` : "TN_PHYSICS_FRACTURE_INVALID", diagnostics, ok, ...(action === "inspect" ? { manifest } : {}) }, ok ? 0 : 1, json);
    }
    return fail("TN_PHYSICS_FRACTURE_COMMAND_UNKNOWN", usage(), json);
  } catch (error) {
    return fail("TN_PHYSICS_FRACTURE_FAILED", error instanceof Error ? error.message : String(error), json, 1);
  }
}

function usage(): string { return "Usage: tn physics fracture generate <id> --recipe <path-or-json> [--seed <n>] [--max-active-pieces <n>] [--max-depth <n>] [--overflow-policy <reject-new|sleep-oldest|despawn-oldest>] [--out <path>] [--project <path>] [--json]\n       tn physics fracture <inspect|validate> <manifest.json> [--project <path>] [--json]"; }
function fail(code: string, message: string, json: boolean, exitCode = 2): ICommandResult { return payload({ code, message, ok: false, severity: "error" }, exitCode, json); }
function payload(value: Record<string, unknown>, exitCode: number, json: boolean): ICommandResult { return { exitCode, stdout: json ? `${JSON.stringify(value, null, 2)}\n` : `${value.code as string}: ${value.ok === true ? "ok" : value.message as string ?? "failed"}\n` }; }
function readFlag(argv: readonly string[], flag: string): string | undefined { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; }
function valueFlag(value: string | undefined): boolean { return value !== undefined && ["--id", "--max-active-pieces", "--max-depth", "--out", "--overflow-policy", "--project", "--recipe", "--seed"].includes(value); }
function numberFlag(argv: readonly string[], flag: string, fallback: number): number { return optionalNumberFlag(argv, flag) ?? fallback; }
function optionalNumberFlag(argv: readonly string[], flag: string): number | undefined { const raw = readFlag(argv, flag); if (raw === undefined) return undefined; const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`${flag} must be a finite number.`); return value; }
function contained(root: string, path: string): string { const target = resolve(root, path); const rel = relative(root, target); if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new Error(`Path '${path}' resolves outside the project.`); return target; }
async function readJsonValue(value: string, project: string): Promise<unknown> { if (value.trimStart().startsWith("{")) return JSON.parse(value); return JSON.parse(await readFile(contained(project, value), "utf8")); }
