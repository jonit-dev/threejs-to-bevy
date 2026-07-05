import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export interface IProofFileHash {
  hash: string;
  path: string;
  role: "asset" | "bundle" | "source";
}

export interface IProofManifest {
  bundleHash?: string;
  commandParameters: Record<string, unknown>;
  files: IProofFileHash[];
  generatedAt: string;
  projectPath: string;
  schema: "threenative.proof-manifest";
  sourceHash: string;
  version: "0.1.0";
}

export interface IProofArtifactMetadata {
  bundleHash?: string;
  commandParameters: Record<string, unknown>;
  fileCount: number;
  generatedAt: string;
  schema: "threenative.proof-artifact-metadata";
  sourceHash: string;
  version: "0.1.0";
}

export interface IProofRecommendation {
  command: string;
  id: string;
  reason: string;
  roles: Array<IProofFileHash["role"]>;
}

export interface IProofFreshnessDiagnostic {
  code: "TN_VERIFY_ASSET_CHANGED" | "TN_VERIFY_BUNDLE_HASH_MISMATCH" | "TN_VERIFY_PROOF_STALE" | "TN_VERIFY_SOURCE_HASH_MISMATCH";
  message: string;
  path: string;
  severity: "warning";
  suggestion: string;
}

export interface IProofFreshnessReport {
  code: "TN_PROVE_CHANGED";
  current: IProofManifest;
  diagnostics: IProofFreshnessDiagnostic[];
  fresh: boolean;
  previous?: IProofManifest;
  recommendations: IProofRecommendation[];
}

export interface IProofDiffReport {
  added: IProofFileHash[];
  changed: Array<{ from: IProofFileHash; to: IProofFileHash }>;
  code: "TN_PROOF_DIFF";
  from: string;
  removed: IProofFileHash[];
  to: string;
}

const sourceRoots = ["content", "src/scripts"];
const assetRoots = ["assets"];
const bundleRoots = ["dist"];

export async function buildProofManifest(options: { commandParameters?: Record<string, unknown>; projectPath: string }): Promise<IProofManifest> {
  const files = [
    ...await collectHashes(options.projectPath, sourceRoots, "source"),
    ...await collectHashes(options.projectPath, assetRoots, "asset"),
    ...await collectHashes(options.projectPath, bundleRoots, "bundle"),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const sourceHash = hashRows(files.filter((file) => file.role === "source"));
  const bundleRows = files.filter((file) => file.role === "bundle");
  return {
    ...(bundleRows.length === 0 ? {} : { bundleHash: hashRows(bundleRows) }),
    commandParameters: options.commandParameters ?? {},
    files,
    generatedAt: new Date(0).toISOString(),
    projectPath: options.projectPath,
    schema: "threenative.proof-manifest",
    sourceHash,
    version: "0.1.0",
  };
}

export async function buildProofArtifactMetadata(options: { commandParameters?: Record<string, unknown>; projectPath: string }): Promise<IProofArtifactMetadata> {
  const manifest = await buildProofManifest(options);
  return {
    ...(manifest.bundleHash === undefined ? {} : { bundleHash: manifest.bundleHash }),
    commandParameters: manifest.commandParameters,
    fileCount: manifest.files.length,
    generatedAt: manifest.generatedAt,
    schema: "threenative.proof-artifact-metadata",
    sourceHash: manifest.sourceHash,
    version: manifest.version,
  };
}

export async function evaluateProofFreshness(options: { previousPath?: string; projectPath: string }): Promise<IProofFreshnessReport> {
  const current = await buildProofManifest({ commandParameters: { source: "tn prove changed" }, projectPath: options.projectPath });
  const previous = options.previousPath === undefined ? undefined : await readProofManifest(options.previousPath);
  const diagnostics = previous === undefined ? [] : freshnessDiagnostics(previous, current);
  return {
    code: "TN_PROVE_CHANGED",
    current,
    diagnostics,
    fresh: previous !== undefined && diagnostics.length === 0,
    ...(previous === undefined ? {} : { previous }),
    recommendations: proofRecommendations(previous, diagnostics),
  };
}

export async function diffProofManifests(options: { fromPath: string; toPath: string }): Promise<IProofDiffReport> {
  const from = await readProofManifest(options.fromPath);
  const to = await readProofManifest(options.toPath);
  const fromByPath = new Map(from.files.map((file) => [file.path, file]));
  const toByPath = new Map(to.files.map((file) => [file.path, file]));
  const added = to.files.filter((file) => !fromByPath.has(file.path));
  const removed = from.files.filter((file) => !toByPath.has(file.path));
  const changed = to.files
    .flatMap((file) => {
      const old = fromByPath.get(file.path);
      return old !== undefined && old.hash !== file.hash ? [{ from: old, to: file }] : [];
    })
    .sort((left, right) => left.to.path.localeCompare(right.to.path));
  return {
    added,
    changed,
    code: "TN_PROOF_DIFF",
    from: options.fromPath,
    removed,
    to: options.toPath,
  };
}

export async function readProofManifest(path: string): Promise<IProofManifest> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (
    !isRecord(parsed)
    || parsed.schema !== "threenative.proof-manifest"
    || parsed.version !== "0.1.0"
    || !Array.isArray(parsed.files)
    || typeof parsed.sourceHash !== "string"
    || typeof parsed.projectPath !== "string"
    || typeof parsed.generatedAt !== "string"
    || !isRecord(parsed.commandParameters)
  ) {
    throw new Error(`Invalid proof manifest: ${path}`);
  }
  return {
    ...(typeof parsed.bundleHash === "string" ? { bundleHash: parsed.bundleHash } : {}),
    commandParameters: parsed.commandParameters,
    files: parsed.files as IProofFileHash[],
    generatedAt: parsed.generatedAt,
    projectPath: parsed.projectPath,
    schema: "threenative.proof-manifest",
    sourceHash: parsed.sourceHash,
    version: "0.1.0",
  };
}

function freshnessDiagnostics(previous: IProofManifest, current: IProofManifest): IProofFreshnessDiagnostic[] {
  const diagnostics: IProofFreshnessDiagnostic[] = [];
  if (previous.sourceHash !== current.sourceHash) {
    diagnostics.push({
      code: "TN_VERIFY_SOURCE_HASH_MISMATCH",
      message: "Durable source hash changed since the previous proof manifest.",
      path: "content/**,src/scripts/**",
      severity: "warning",
      suggestion: "Run authoring validation, build, and the relevant playtest or scene proof.",
    });
  }
  if (previous.bundleHash !== current.bundleHash) {
    diagnostics.push({
      code: "TN_VERIFY_BUNDLE_HASH_MISMATCH",
      message: "Bundle artifact hash changed since the previous proof manifest.",
      path: "dist/**",
      severity: "warning",
      suggestion: "Refresh runtime proof that depends on emitted bundle output.",
    });
  }
  if (changedRoles(previous, current).has("asset")) {
    diagnostics.push({
      code: "TN_VERIFY_ASSET_CHANGED",
      message: "Asset files changed since the previous proof manifest.",
      path: "assets/**",
      severity: "warning",
      suggestion: "Run asset inspection, model test, scale proof, and screenshot proof for affected high-value assets.",
    });
  }
  if (diagnostics.length > 0) {
    diagnostics.push({
      code: "TN_VERIFY_PROOF_STALE",
      message: "At least one proof input changed; prior proof artifacts should be treated as stale.",
      path: "artifacts/game-production/proof-manifest.json",
      severity: "warning",
      suggestion: "Run the recommended proof commands and record a new proof manifest.",
    });
  }
  return diagnostics;
}

function proofRecommendations(previous: IProofManifest | undefined, diagnostics: IProofFreshnessDiagnostic[]): IProofRecommendation[] {
  if (previous === undefined) {
    return [
      { command: "tn authoring validate --project . --json", id: "validate-source", reason: "No previous proof manifest was provided.", roles: ["source"] },
      { command: "tn build --project . --json", id: "build-bundle", reason: "No previous proof manifest was provided.", roles: ["bundle"] },
      { command: "tn game qa --project . --run-proof --json", id: "run-game-qa", reason: "No previous proof manifest was provided.", roles: ["source", "asset", "bundle"] },
    ];
  }
  const recommendations: IProofRecommendation[] = [];
  if (diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_SOURCE_HASH_MISMATCH")) {
    recommendations.push(
      { command: "tn authoring validate --project . --json", id: "validate-source", reason: "Durable source changed.", roles: ["source"] },
      { command: "tn build --project . --json", id: "build-bundle", reason: "Durable source changed.", roles: ["bundle", "source"] },
      { command: "tn playtest --project . --entity <player-id> --press <KeyboardEvent.code> --frames 30 --expect-moved --json", id: "run-playtest", reason: "Script or gameplay source may have changed.", roles: ["source"] },
    );
  }
  if (diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_ASSET_CHANGED")) {
    recommendations.push(
      { command: "tn asset inspect <asset-path> --json", id: "inspect-asset", reason: "Asset files changed.", roles: ["asset"] },
      { command: "tn model-test <asset-path> --verify --json", id: "model-test-asset", reason: "Asset files changed.", roles: ["asset"] },
    );
  }
  if (diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_BUNDLE_HASH_MISMATCH")) {
    recommendations.push({ command: "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json", id: "capture-screenshot", reason: "Emitted bundle changed.", roles: ["bundle"] });
  }
  return dedupeRecommendations(recommendations);
}

function changedRoles(previous: IProofManifest, current: IProofManifest): Set<IProofFileHash["role"]> {
  const roles = new Set<IProofFileHash["role"]>();
  const previousByPath = new Map(previous.files.map((file) => [file.path, file]));
  const currentByPath = new Map(current.files.map((file) => [file.path, file]));
  for (const file of current.files) {
    const old = previousByPath.get(file.path);
    if (old === undefined || old.hash !== file.hash) {
      roles.add(file.role);
    }
  }
  for (const file of previous.files) {
    if (!currentByPath.has(file.path)) {
      roles.add(file.role);
    }
  }
  return roles;
}

function dedupeRecommendations(recommendations: IProofRecommendation[]): IProofRecommendation[] {
  const seen = new Set<string>();
  return recommendations.filter((recommendation) => {
    if (seen.has(recommendation.id)) {
      return false;
    }
    seen.add(recommendation.id);
    return true;
  });
}

async function collectHashes(projectPath: string, roots: string[], role: IProofFileHash["role"]): Promise<IProofFileHash[]> {
  const rows: IProofFileHash[] = [];
  for (const root of roots) {
    const absoluteRoot = resolve(projectPath, root);
    if (!await exists(absoluteRoot)) {
      continue;
    }
    for (const file of await collectFiles(absoluteRoot)) {
      rows.push({
        hash: createHash("sha256").update(await readFile(file)).digest("hex"),
        path: relative(projectPath, file).split("\\").join("/"),
        role,
      });
    }
  }
  return rows;
}

async function collectFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) {
    return [path];
  }
  if (!info.isDirectory()) {
    return [];
  }
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collectFiles(join(path, entry.name))));
  return nested.flat();
}

function hashRows(rows: IProofFileHash[]): string {
  const hash = createHash("sha256");
  for (const row of rows.slice().sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(row.path);
    hash.update(row.hash);
  }
  return hash.digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
