import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { normalizeRelativePath, readAuthoringJsonDocument } from "./documents.js";
import { formatAuthoringDocument } from "./format.js";
import { validateGeneratorDocument } from "./operations/sharedA.js";

export interface IGeneratorOwnerAuthorization {
  generatorId: string;
  kind: "generator";
}

export interface IGeneratorOutputOwner {
  command: string;
  generatorId: string;
  input: string;
  output: string;
  provenancePath: string;
  provider: "blender" | "img2threejs" | "typescript";
}

export interface IGeneratorProvenanceIndex {
  diagnostics: IAuthoringDiagnostic[];
  filesRead: string[];
  ownersByOutput: ReadonlyMap<string, IGeneratorOutputOwner>;
}

export interface IResolvedGeneratorOverwritePolicy {
  owner: "default" | "existing-provenance" | "explicit-flag";
  policy: "manual" | "replace" | "skip";
}

export async function resolveGeneratorOverwritePolicy(
  projectPath: string,
  generatorId: string,
  requested?: string,
): Promise<IResolvedGeneratorOverwritePolicy> {
  if (requested === "manual" || requested === "replace" || requested === "skip") {
    return { owner: "explicit-flag", policy: requested };
  }
  if (requested !== undefined) {
    throw new Error(`Unsupported generator overwrite policy '${requested}'.`);
  }
  try {
    const data = JSON.parse(
      await readFile(resolve(projectPath, "content/generators", `${generatorId}.generator.json`), "utf8"),
    ) as unknown;
    if (
      isRecord(data)
      && data.id === generatorId
      && (data.overwritePolicy === "manual" || data.overwritePolicy === "replace" || data.overwritePolicy === "skip")
    ) {
      return { owner: "existing-provenance", policy: data.overwritePolicy };
    }
  } catch (error) {
    if (!isMissing(error) && !(error instanceof SyntaxError)) throw error;
  }
  return { owner: "default", policy: "manual" };
}

export async function resolveGeneratorProvenance(projectPath: string): Promise<IGeneratorProvenanceIndex> {
  const directory = resolve(projectPath, "content/generators");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return { diagnostics: [], filesRead: [], ownersByOutput: new Map() };
    throw error;
  }

  const diagnostics: IAuthoringDiagnostic[] = [];
  const ownersByOutput = new Map<string, IGeneratorOutputOwner>();
  const conflictedOutputs = new Set<string>();
  const filesRead: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".generator.json")) continue;
    const provenancePath = `content/generators/${entry.name}`;
    filesRead.push(provenancePath);
    const readResult = await readAuthoringJsonDocument(projectPath, provenancePath);
    diagnostics.push(...readResult.diagnostics);
    if (readResult.document === undefined) continue;
    const validation = await validateGeneratorDocument(provenancePath, readResult.document.data, projectPath);
    diagnostics.push(...validation);
    if (hasAuthoringErrors([...readResult.diagnostics, ...validation]) || !isRecord(readResult.document.data)) continue;

    const data = readResult.document.data;
    const provider = data.provider === "blender" ? "blender" : data.provider === "img2threejs" ? "img2threejs" : "typescript";
    if (typeof data.id !== "string" || !Array.isArray(data.outputs)) continue;
    const input = provider === "typescript" ? data.module : data.recipe;
    if (typeof input !== "string") continue;
    for (const outputValue of data.outputs) {
      if (typeof outputValue !== "string") continue;
      let output: string;
      try {
        output = normalizeOwnedOutput(outputValue);
      } catch (error) {
        diagnostics.push(authoringDiagnostic({
          code: "TN_AUTHORING_GENERATOR_OUTPUT_PATH_INVALID",
          file: provenancePath,
          message: `Generator '${data.id}' declares an unsafe output path.`,
          path: "/outputs",
          suggestion: "Use a project-relative output path that does not escape the project.",
          value: error instanceof Error ? error.message : String(error),
        }));
        continue;
      }
      const owner: IGeneratorOutputOwner = {
        command: `tn generator run ${data.id} --project . --json`,
        generatorId: data.id,
        input,
        output,
        provenancePath,
        provider,
      };
      if (conflictedOutputs.has(output)) continue;
      const existing = ownersByOutput.get(output);
      if (existing !== undefined && existing.provenancePath !== owner.provenancePath) {
        diagnostics.push(authoringDiagnostic({
          code: "TN_AUTHORING_GENERATED_OUTPUT_OWNER_CONFLICT",
          file: output,
          message: `Generated output '${output}' is declared by both '${existing.generatorId}' and '${owner.generatorId}'.`,
          suggestion: "Keep exactly one generator provenance owner for each output before applying authoring changes.",
          value: { owners: [existing.provenancePath, owner.provenancePath] },
        }));
        ownersByOutput.delete(output);
        conflictedOutputs.add(output);
        continue;
      }
      if (existing === undefined) ownersByOutput.set(output, owner);
    }
  }
  return { diagnostics: sortAuthoringDiagnostics(diagnostics), filesRead, ownersByOutput };
}

export interface IGeneratorOutputClaimOptions {
  generatorId: string;
  output: string;
  overwritePolicy: "manual" | "replace" | "skip";
  projectPath: string;
  provider: "blender" | "img2threejs";
}

export async function validateGeneratorOutputClaim(options: IGeneratorOutputClaimOptions): Promise<IAuthoringDiagnostic[]> {
  let output: string;
  try {
    output = normalizeOwnedOutput(options.output);
  } catch (error) {
    return [authoringDiagnostic({
      code: "TN_IMG2THREEJS_RECIPE_INVALID",
      file: options.output,
      fix: { instruction: "Write generated GLBs beneath assets/generated/ using a project-relative path." },
      message: "Generated output path is unsafe.",
      path: "/output",
      value: error instanceof Error ? error.message : String(error),
    })];
  }
  const index = await resolveGeneratorProvenance(options.projectPath);
  const diagnostics = [...index.diagnostics];
  const owner = index.ownersByOutput.get(output);
  if (owner !== undefined && (owner.generatorId !== options.generatorId || owner.provider !== options.provider)) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_GENERATED_OUTPUT_OWNER_CONFLICT",
      file: output,
      fix: { instruction: "Keep exactly one generator provenance owner for this output." },
      message: `Generated output '${output}' is already owned by generator '${owner.generatorId}'.`,
      path: "/output",
      value: { existingOwner: owner.provenancePath, requestedGeneratorId: options.generatorId },
    }));
    return sortAuthoringDiagnostics(diagnostics);
  }
  if (options.overwritePolicy === "manual" && owner === undefined) {
    try {
      await access(resolve(options.projectPath, output));
      diagnostics.push(authoringDiagnostic({
        code: "TN_GENERATOR_OUTPUT_CONFLICT",
        file: output,
        fix: { instruction: "Move the manual output, choose a new asset id, or explicitly use overwrite policy 'replace'.", allowed: ["replace"] },
        message: `Generated output '${output}' already exists without matching generator provenance.`,
        path: "/output",
      }));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  if (options.overwritePolicy === "skip" && owner === undefined) {
    try {
      await access(resolve(options.projectPath, output));
      diagnostics.push(authoringDiagnostic({
        code: "TN_GENERATOR_OUTPUT_CONFLICT",
        file: output,
        fix: { instruction: "Leave the existing output untouched or explicitly use overwrite policy 'replace'.", allowed: ["replace"] },
        message: `Generated output '${output}' already exists and overwrite policy 'skip' does not claim manual output.`,
        path: "/output",
      }));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return sortAuthoringDiagnostics(diagnostics);
}

export function generatedOutputOwnershipDiagnostic(
  owner: IGeneratorOutputOwner,
  authorization?: IGeneratorOwnerAuthorization,
): IAuthoringDiagnostic | undefined {
  if (authorization?.kind === "generator" && authorization.generatorId === owner.generatorId) return undefined;
  return authoringDiagnostic({
    code: "TN_AUTHORING_GENERATED_OUTPUT_OWNED",
    file: owner.output,
    message: `Authoring output '${owner.output}' is owned by generator '${owner.generatorId}'.`,
    suggestion: `Edit '${owner.input}' and run '${owner.command}' so the owning generator publishes this output.`,
    value: {
      authorizedGeneratorId: authorization?.generatorId,
      command: owner.command,
      generatorId: owner.generatorId,
      input: owner.input,
      provenancePath: owner.provenancePath,
    },
  });
}

export async function advanceGeneratorOutputHash(projectPath: string, owner: IGeneratorOutputOwner): Promise<string> {
  const provenanceFile = resolve(projectPath, owner.provenancePath);
  const data = JSON.parse(await readFile(provenanceFile, "utf8")) as unknown;
  if (!isRecord(data) || data.id !== owner.generatorId || !Array.isArray(data.outputs)) {
    throw new Error(`Generator provenance '${owner.provenancePath}' changed while advancing output ownership.`);
  }
  const outputs = data.outputs.filter((value): value is string => typeof value === "string").map(normalizeOwnedOutput);
  if (!outputs.includes(owner.output)) {
    throw new Error(`Generator provenance '${owner.provenancePath}' no longer declares '${owner.output}'.`);
  }
  const outputHash = await hashGeneratorOutputs(projectPath, outputs);
  data.outputHash = outputHash;
  await writeFile(provenanceFile, formatAuthoringDocument(data), "utf8");
  return outputHash;
}

export async function hashGeneratorOutputs(projectPath: string, outputs: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const output of [...outputs].map(normalizeOwnedOutput).sort()) {
    hash.update(output);
    hash.update("\0");
    try {
      hash.update(await readFile(resolve(projectPath, output)));
    } catch (error) {
      if (!isMissing(error)) throw error;
      hash.update("<missing>");
    }
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function normalizeOwnedOutput(path: string): string {
  const normalized = normalizeRelativePath(path);
  const segments = normalized.split("/");
  if (
    normalized === ""
    || normalized.startsWith("/")
    || /^[a-zA-Z]:\//.test(normalized)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe generator output path '${path}'.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
