import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { blenderMcpOutcomeCoverage, EXTERNAL_TOOL_REGISTRY } from "@threenative/cli";

export type BlenderHost = "linux-x64" | "macos-arm64" | "macos-x64" | "windows-x64";
export type HostDisposition = "promoted" | "rejected";

export interface IBlenderHostEvidence {
  archiveBytes?: number;
  cacheBytes?: number;
  cleanup: { noLocks: boolean; noProcesses: boolean; noStaging: boolean };
  disposition: HostDisposition;
  durationMs?: number;
  executableVersion?: string;
  hardenedArgv?: string[];
  host: BlenderHost;
  installAcknowledged?: boolean;
  rejection?: { code: string; message: string };
  recipes?: Array<{ authoringValid: boolean; bounds: { max: number[]; min: number[] }; buildPassed: boolean; glbBytes?: number; glbSha256?: string; id: string; materials: number; meshes: number; triangles: number }>;
  runnerSha256?: string;
  sha256?: string;
  sourceUrl?: string;
}

export interface IBlenderToolGateEvidence {
  coverage: Array<{ disposition: "deferred" | "equivalent" | "full" | "safe-replacement"; evidence: string; id: number; mcpTool?: string; owner?: string; upstreamTool: string }>;
  hosts: IBlenderHostEvidence[];
  negativeControls: Array<{ cleanup: boolean; diagnostic: string; evidence: string; id: string; passed: boolean }>;
  providers: Array<{ evidence: string; id: "hyper3d" | "poly-haven" | "sketchfab"; offlineAfterAcquisition: boolean; pendingReason?: string; secretFree: boolean; status: "pending" | "verified" }>;
  schema: "threenative.blender-tool-evidence";
  version: "0.1.0";
}

export interface IBlenderToolGateDiagnostic { code: string; message: string; severity: "error" }
export interface IBlenderToolGateResult { diagnostics: IBlenderToolGateDiagnostic[]; ok: boolean }

interface IBlenderHostSmokeReport {
  arch: string;
  authoringValid: boolean;
  buildPassed: boolean;
  cleanup: { noLocks: boolean; noProcesses: boolean; noStaging: boolean; noWorkDirectories: boolean };
  durationMs: number;
  host: "darwin-arm64" | "darwin-x64" | "linux-x64" | "win32-x64";
  manifest: Record<string, unknown>;
  metrics: { archiveBytes: number; cacheBytes: number; installDurationMs: number; peakChildMemoryBytes: number };
  ok: boolean;
  recipes: Array<{ bounds?: { max: number[]; min: number[] }; byteSize?: number; durationMs?: number; execution?: { argv: string[]; cwd: string; executable: string; exitCode: number; peakMemoryBytes?: number; timedOut: boolean; timeoutMs: number }; id: string; materials: number; meshes: number; outputHash?: string; runnerSha256?: string; triangles: number; workDirectoryRemoved?: boolean }>;
  runnerSha256?: string;
  schema: string;
  tool: { executablePath?: string; source?: string; version?: string; versionOutput?: string };
  version: string;
}

const supportedHosts: readonly BlenderHost[] = ["linux-x64", "macos-x64", "macos-arm64", "windows-x64"];
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const requiredRecipes = ["prop.barrier", "prop.crate", "prop.pickup"];
const requiredControls = ["archive-hash", "archive-tar-traversal", "archive-zip-traversal", "download-interrupted", "lock-stale", "process-timeout", "recipe-budget", "recipe-code-field", "recipe-path", "output-malformed", "output-oversized"];
const requiredHardenedArgs = ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python"];
const expectedRunnerSha256 = createHash("sha256").update(readFileSync(fileURLToPath(new URL("../../../packages/cli/src/blender/runner.py", import.meta.url)))).digest("hex");
const hostToManifest = { "linux-x64": "linux-x64", "macos-arm64": "darwin-arm64", "macos-x64": "darwin-x64", "windows-x64": "win32-x64" } as const;
const manifestToHost = { "linux-x64": "linux-x64", "darwin-arm64": "macos-arm64", "darwin-x64": "macos-x64", "win32-x64": "windows-x64" } as const;
const expectedRecipes = {
  "prop.barrier": { bounds: { min: [-1.675000011920929, 0, -0.4749999940395355], max: [1.675000011920929, 1.6299999803304672, 0.4749999940395355] }, materials: 4, meshes: 12, triangles: 1584 },
  "prop.crate": { bounds: { min: [-0.8100000023841858, 0, -0.7550000138580799], max: [0.8100000023841858, 1.297648043179041, 0.75] }, materials: 3, meshes: 14, triangles: 168 },
  "prop.pickup": { bounds: { min: [-0.7000000338827698, 0, -0.8500000450959003], max: [0.7000000338827698, 1.9450000884143757, 0.8500000450959003] }, materials: 3, meshes: 11, triangles: 2398 },
} as const;
const boundsTolerance = 0.00001;
const secretPattern = /Bearer\s+[A-Za-z0-9._~-]{16,}|api[_-]?key\s*[=:]\s*["']?[A-Za-z0-9._~-]{16,}|[?&](?:signature|token|x-amz-signature)=[^\s&]{8,}/iu;

export function validateBlenderToolEvidence(evidence: IBlenderToolGateEvidence): IBlenderToolGateResult {
  const diagnostics: IBlenderToolGateDiagnostic[] = [];
  if (evidence.schema !== "threenative.blender-tool-evidence" || evidence.version !== "0.1.0") fail(diagnostics, "TN_VERIFY_BLENDER_EVIDENCE_SCHEMA_INVALID", "Blender tool evidence schema/version is invalid.");
  for (const host of supportedHosts) {
    const rows = evidence.hosts.filter((row) => row.host === host);
    if (rows.length !== 1) { fail(diagnostics, "TN_VERIFY_BLENDER_HOST_EVIDENCE_MISSING", `Host '${host}' must have exactly one promotion or rejection row.`); continue; }
    validateHost(rows[0]!, diagnostics);
  }
  for (const id of requiredControls) {
    const row = evidence.negativeControls.find((candidate) => candidate.id === id);
    const evidencePath = row === undefined ? "" : evidenceFilePath(row.evidence);
    if (row?.passed !== true || row.cleanup !== true || row.evidence.trim() === "" || !existsSync(evidencePath) || !/^TN_[A-Z0-9_]+$/u.test(row.diagnostic) || !readFileSync(evidencePath, "utf8").includes(row.diagnostic)) fail(diagnostics, "TN_VERIFY_BLENDER_NEGATIVE_CONTROL_MISSING", `Negative control '${id}' must pass with cleanup and a stable outcome code present in its existing evidence.`);
  }
  if (new Set(evidence.negativeControls.map((row) => row.id)).size !== requiredControls.length || evidence.negativeControls.length !== requiredControls.length) fail(diagnostics, "TN_VERIFY_BLENDER_NEGATIVE_CONTROL_INVENTORY_INVALID", "Negative controls must match the exact required inventory without duplicates or extras.");
  validateCoverage(evidence.coverage, diagnostics);
  for (const provider of ["poly-haven", "sketchfab", "hyper3d"] as const) {
    const row = evidence.providers.find((candidate) => candidate.id === provider);
    if (row === undefined || row.evidence === "" || !row.secretFree || !existsSync(evidenceFilePath(row.evidence))) fail(diagnostics, "TN_VERIFY_BLENDER_PROVIDER_EVIDENCE_MISSING", `Provider '${provider}' requires existing secret-free evidence.`);
    else if (row.status === "verified" && !row.offlineAfterAcquisition) fail(diagnostics, "TN_VERIFY_BLENDER_PROVIDER_EVIDENCE_MISSING", `Verified provider '${provider}' requires offline-after-acquisition evidence.`);
    else if (row.status === "pending" && (row.pendingReason?.trim() ?? "") === "") fail(diagnostics, "TN_VERIFY_BLENDER_PROVIDER_PENDING_REASON_MISSING", `Pending provider '${provider}' requires an explicit reason.`);
    else {
      const artifact = readFileSync(evidenceFilePath(row.evidence), "utf8");
      if (secretPattern.test(artifact)) fail(diagnostics, "TN_VERIFY_BLENDER_PROVIDER_SECRET_FOUND", `Provider evidence '${row.evidence}' contains a credential or signed URL.`);
    }
  }
  const serialized = JSON.stringify(evidence);
  if (secretPattern.test(serialized)) fail(diagnostics, "TN_VERIFY_BLENDER_PROVIDER_SECRET_FOUND", "Provider evidence contains a credential or signed URL.");
  return { diagnostics, ok: diagnostics.length === 0 };
}

function validateHost(row: IBlenderHostEvidence, diagnostics: IBlenderToolGateDiagnostic[]): void {
  if (!row.cleanup.noLocks || !row.cleanup.noProcesses || !row.cleanup.noStaging) fail(diagnostics, "TN_VERIFY_BLENDER_HOST_CLEANUP_MISSING", `Host '${row.host}' lacks complete process/lock/staging cleanup evidence.`);
  if (row.disposition === "rejected") {
    if (row.rejection === undefined || !/^TN_[A-Z0-9_]+$/u.test(row.rejection.code) || row.rejection.message.trim() === "") fail(diagnostics, "TN_VERIFY_BLENDER_HOST_REJECTION_INVALID", `Rejected host '${row.host}' requires a stable diagnostic code and reason.`);
    return;
  }
  const artifact = EXTERNAL_TOOL_REGISTRY.blender.artifacts[hostToManifest[row.host]];
  if (row.installAcknowledged !== true || row.sourceUrl !== artifact.url || row.sha256 !== artifact.sha256 || row.archiveBytes !== artifact.expectedBytes || row.executableVersion !== EXTERNAL_TOOL_REGISTRY.blender.version || !(row.cacheBytes !== undefined && row.cacheBytes > row.archiveBytes) || row.runnerSha256 !== expectedRunnerSha256) fail(diagnostics, "TN_VERIFY_BLENDER_INSTALL_UNVERIFIED", `Promoted host '${row.host}' does not exactly match the owning manifest, runner hash, consent, cache size, and version proof.`);
  const argv = row.hardenedArgv ?? [];
  const expectedArgv = [...requiredHardenedArgs, "<owned-runner>", "--", "--job", "<owned-job>"];
  if (JSON.stringify(argv) !== JSON.stringify(expectedArgv)) fail(diagnostics, "TN_VERIFY_BLENDER_FORBIDDEN_EXECUTION_SURFACE", `Host '${row.host}' hardened argv must exactly match the reviewed runner invocation.`);
  const recipes = row.recipes ?? [];
  for (const id of requiredRecipes) {
    const recipe = recipes.find((candidate) => candidate.id === id);
    const baseline = expectedRecipes[id as keyof typeof expectedRecipes];
    if (recipe === undefined || !recipe.authoringValid || !recipe.buildPassed || recipe.meshes !== baseline.meshes || recipe.materials !== baseline.materials || recipe.triangles !== baseline.triangles || !boundsWithinTolerance(recipe.bounds.min, baseline.bounds.min) || !boundsWithinTolerance(recipe.bounds.max, baseline.bounds.max)) fail(diagnostics, "TN_VERIFY_BLENDER_SEMANTIC_EVIDENCE_MISSING", `Promoted host '${row.host}' lacks baseline-bound semantic/build evidence for '${id}'.`);
  }
}

function boundsWithinTolerance(actual: number[], expected: readonly number[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => Number.isFinite(value) && Math.abs(value - expected[index]!) <= boundsTolerance);
}

function validateHostReport(report: IBlenderHostSmokeReport, evidence: IBlenderToolGateEvidence, diagnostics: IBlenderToolGateDiagnostic[]): void {
  const host = report.host;
  const retained = evidence.hosts.find((row) => row.host === manifestToHost[host]);
  const artifact = EXTERNAL_TOOL_REGISTRY.blender.artifacts[host];
  if (report.schema !== "threenative.verify.blender-host-smoke" || report.version !== "0.1.0" || report.ok !== true || retained === undefined) fail(diagnostics, "TN_VERIFY_BLENDER_HOST_REPORT_INVALID", "Host report schema/result is invalid or its host is absent from the retained disposition inventory.");
  if (JSON.stringify(report.manifest) !== JSON.stringify(artifact) || report.tool.source !== "managed" || report.tool.version !== EXTERNAL_TOOL_REGISTRY.blender.version || report.runnerSha256 !== expectedRunnerSha256 || report.tool.executablePath === undefined) fail(diagnostics, "TN_VERIFY_BLENDER_HOST_BINDING_INVALID", "Host report must bind the managed owning artifact, executable version/path, and owned runner hash.");
  if (!report.authoringValid || !report.buildPassed || !report.cleanup.noLocks || !report.cleanup.noProcesses || !report.cleanup.noStaging || !report.cleanup.noWorkDirectories) fail(diagnostics, "TN_VERIFY_BLENDER_HOST_CLEANUP_MISSING", "Host report requires authoring/build success and measured process/lock/staging/work-directory cleanup.");
  if (!(report.durationMs > 0) || report.metrics.archiveBytes !== artifact.expectedBytes || !(report.metrics.cacheBytes > artifact.expectedBytes) || !(report.metrics.installDurationMs > 0) || !(report.metrics.peakChildMemoryBytes > 0)) fail(diagnostics, "TN_VERIFY_BLENDER_HOST_METRICS_INVALID", "Host report metrics must include duration, exact archive size, measured cache size, install/reuse duration, and peak child memory.");
  for (const [id, baseline] of Object.entries(expectedRecipes)) {
    const recipe = report.recipes.find((row) => row.id === id);
    const execution = recipe?.execution;
    const argv = execution?.argv ?? [];
    const runnerPath = argv[6] ?? "";
    const jobPath = argv[9] ?? "";
    const exactExecution = argv.length === 10 && JSON.stringify(argv.slice(0, 6)) === JSON.stringify(requiredHardenedArgs) && isAbsolute(runnerPath) && basename(runnerPath) === "runner.py" && argv[7] === "--" && argv[8] === "--job" && isAbsolute(jobPath) && basename(jobPath) === "job.json" && dirname(jobPath) === execution?.cwd && execution.timeoutMs === 120_000 && execution.executable === report.tool.executablePath && execution.exitCode === 0 && execution.timedOut === false && (execution.peakMemoryBytes ?? 0) > 0;
    if (recipe === undefined || recipe.materials !== baseline.materials || recipe.meshes !== baseline.meshes || recipe.triangles !== baseline.triangles || !boundsWithinTolerance(recipe.bounds?.min ?? [], baseline.bounds.min) || !boundsWithinTolerance(recipe.bounds?.max ?? [], baseline.bounds.max) || !(recipe.byteSize !== undefined && recipe.byteSize > 0) || !(recipe.durationMs !== undefined && recipe.durationMs > 0) || !/^sha256:[a-f0-9]{64}$/u.test(recipe.outputHash ?? "") || recipe.runnerSha256 !== expectedRunnerSha256 || recipe.workDirectoryRemoved !== true || !exactExecution) fail(diagnostics, "TN_VERIFY_BLENDER_HOST_RECIPE_INVALID", `Host report recipe '${id}' lacks bound semantics, output hash/size/duration, cleanup, or exact executed argv.`);
  }
  if (report.recipes.length !== requiredRecipes.length) fail(diagnostics, "TN_VERIFY_BLENDER_HOST_RECIPE_INVALID", "Host report must contain exactly the three retained recipes.");
}

function validateCoverage(rows: IBlenderToolGateEvidence["coverage"], diagnostics: IBlenderToolGateDiagnostic[]): void {
  if (rows.length !== 22 || rows.some((row, index) => row.id !== index + 1)) { fail(diagnostics, "TN_VERIFY_BLENDER_COVERAGE_DENOMINATOR_INVALID", "Coverage inventory must retain ordered rows 1-22."); return; }
  const covered = rows.filter((row) => row.disposition !== "deferred");
  if (covered.length < 19 || covered.some((row) => row.evidence.trim() === "")) fail(diagnostics, "TN_VERIFY_BLENDER_COVERAGE_INCOMPLETE", "At least nineteen coverage rows require evidence-backed dispositions.");
  if (rows[3]?.disposition !== "safe-replacement") fail(diagnostics, "TN_VERIFY_BLENDER_UNSAFE_PARITY_CLAIM", "execute_blender_code must remain a safe replacement, never full parity.");
  if (rows.slice(19).some((row) => row.disposition !== "deferred")) fail(diagnostics, "TN_VERIFY_BLENDER_HUNYUAN_DEFERRAL_INVALID", "Hunyuan generate/poll/import rows 20-22 must remain visible and deferred until separately approved.");
  for (const [index, row] of rows.entries()) {
    const owner = blenderMcpOutcomeCoverage[index];
    if (owner === undefined || row.upstreamTool !== owner.upstreamTool || row.disposition !== owner.disposition || row.evidence !== owner.evidence || row.mcpTool !== owner.mcpTool || row.owner !== owner.owner) fail(diagnostics, "TN_VERIFY_BLENDER_COVERAGE_DRIFT", `Coverage row '${row.id}' must match the owning CLI registry exactly.`);
    if (!existsSync(evidenceFilePath(row.evidence))) fail(diagnostics, "TN_VERIFY_BLENDER_COVERAGE_EVIDENCE_MISSING", `Coverage row '${row.id}' references missing evidence '${row.evidence}'.`);
    if (row.disposition === "deferred" && (!row.owner?.startsWith("follow-on:") || row.evidence.trim() === "")) fail(diagnostics, "TN_VERIFY_BLENDER_HUNYUAN_DEFERRAL_INVALID", `Deferred row '${row.id}' requires a documented reason/evidence link and follow-up owner.`);
  }
}

function evidenceFilePath(path: string): string {
  const filePath = path.split("#", 1)[0] ?? path;
  return isAbsolute(filePath) ? filePath : resolve(repositoryRoot, filePath);
}

function fail(diagnostics: IBlenderToolGateDiagnostic[], code: string, message: string): void { diagnostics.push({ code, message, severity: "error" }); }

export async function runBlenderToolGate(options: { evidencePath: string; hostReportPath?: string; reportPath?: string }): Promise<IBlenderToolGateResult & { reportPath: string }> {
  const evidenceText = await readFile(resolve(options.evidencePath), "utf8");
  const evidence = JSON.parse(evidenceText) as IBlenderToolGateEvidence;
  const result = validateBlenderToolEvidence(evidence);
  let hostReport: IBlenderHostSmokeReport | undefined;
  let hostReportSha256: string | undefined;
  if (options.hostReportPath !== undefined) {
    const hostReportText = await readFile(resolve(options.hostReportPath), "utf8");
    hostReport = JSON.parse(hostReportText) as IBlenderHostSmokeReport;
    hostReportSha256 = createHash("sha256").update(hostReportText).digest("hex");
    validateHostReport(hostReport, evidence, result.diagnostics);
    result.ok = result.diagnostics.length === 0;
  }
  const reportPath = resolve(options.reportPath ?? "tools/verify/artifacts/blender-tool/verification-report.json");
  await mkdir(dirname(reportPath), { recursive: true });
  const report = {
    ...result,
    evidencePath: resolve(options.evidencePath),
    evidenceSha256: createHash("sha256").update(evidenceText).digest("hex"),
    hostReportPath: options.hostReportPath === undefined ? undefined : resolve(options.hostReportPath),
    hostReportSha256,
    schema: "threenative.verify.blender-tool",
    summary: {
      coverage: { covered: evidence.coverage.filter((row) => row.disposition !== "deferred").length, deferred: evidence.coverage.filter((row) => row.disposition === "deferred").length, total: evidence.coverage.length },
      hosts: evidence.hosts.map((row) => ({ disposition: row.disposition, host: row.host, recipes: row.recipes?.map(({ glbBytes, glbSha256, id, materials, meshes, triangles }) => ({ glbBytes, glbSha256, id, materials, meshes, triangles })) ?? [] })),
      hostExecution: hostReport === undefined ? undefined : { durationMs: hostReport.durationMs, host: hostReport.host, metrics: hostReport.metrics, recipeHashes: hostReport.recipes.map(({ id, outputHash }) => ({ id, outputHash })) },
      negativeControls: { passed: evidence.negativeControls.filter((row) => row.passed && row.cleanup).length, total: evidence.negativeControls.length },
      providers: evidence.providers.map(({ id, pendingReason, status }) => ({ id, pendingReason, status })),
    },
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...result, reportPath };
}

async function main(): Promise<void> {
  const evidencePath = process.argv[2] ?? "tools/verify/evidence/blender-tool.json";
  const hostReportIndex = process.argv.indexOf("--host-report");
  const reportIndex = process.argv.indexOf("--report");
  const result = await runBlenderToolGate({ evidencePath, ...(hostReportIndex === -1 ? {} : { hostReportPath: process.argv[hostReportIndex + 1] }), ...(reportIndex === -1 ? {} : { reportPath: process.argv[reportIndex + 1] }) });
  process.stdout.write(`${JSON.stringify({ code: result.ok ? "TN_VERIFY_BLENDER_TOOL_OK" : "TN_VERIFY_BLENDER_TOOL_FAILED", ...result }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
