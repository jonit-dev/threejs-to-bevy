import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_POLICY = "scripts/rust-quality-policy.json";
const DEFAULT_REPORT = "tools/verify/artifacts/rust-quality/report.json";
const CURRENT_PHASE = 3;
export const RUST_QUALITY_COMMAND_TIMEOUT_MS = 600_000;
export const RUST_QUALITY_WRAPPER_TIMEOUT_MS = RUST_QUALITY_COMMAND_TIMEOUT_MS * 3 + 60_000;
const KNOWN_REMOVE_BY_PHASES = [5, 6];

function isSafeRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !isAbsolute(value)
    && !value.includes("*")
    && !value.replaceAll("\\", "/").split("/").includes("..");
}

function diagnostic(code, message, extra = {}) {
  return { code, severity: "error", message, ...extra };
}

export function validateRustQualityPolicy(policy) {
  const issues = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return [diagnostic("TN_RUST_QUALITY_POLICY_INVALID", "Policy must be a JSON object.")];
  }
  if (policy.version !== 1) issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", "Policy version must be 1."));
  if (!isSafeRelativePath(policy.workspace)) {
    issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", "Policy workspace must be a non-wildcard repo-relative path."));
  }
  if (policy.timeoutMs !== RUST_QUALITY_COMMAND_TIMEOUT_MS) {
    issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `Policy timeoutMs must equal the checker-owned ${RUST_QUALITY_COMMAND_TIMEOUT_MS}ms command timeout.`));
  }
  if (!Array.isArray(policy.allowedRemoveByPhases)
    || policy.allowedRemoveByPhases.length !== KNOWN_REMOVE_BY_PHASES.length
    || KNOWN_REMOVE_BY_PHASES.some((phase, index) => policy.allowedRemoveByPhases[index] !== phase)) {
    issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `Policy allowedRemoveByPhases must equal the code-owned phase set [${KNOWN_REMOVE_BY_PHASES.join(", ")}].`));
  }
  if (!Array.isArray(policy.debt)) {
    issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", "Policy debt must be an array."));
    return issues;
  }
  const seen = new Set();
  for (const [index, entry] of policy.debt.entries()) {
    const label = `debt[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label} must be an object.`));
      continue;
    }
    if (typeof entry.lint !== "string" || entry.lint.trim().length === 0 || /[\s*]/.test(entry.lint)) {
      issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label}.lint must be an exact non-empty compiler lint code without whitespace or a wildcard.`));
    }
    if (!isSafeRelativePath(entry.path)) {
      issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label}.path must be an exact repo-relative path without a wildcard.`));
    }
    if (!Number.isInteger(entry.maximum) || entry.maximum < 0) {
      issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label}.maximum must be a non-negative integer.`));
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
      issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label}.reason must be a non-empty string.`));
    }
    if (!KNOWN_REMOVE_BY_PHASES.includes(entry.removeByPhase)) {
      issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label}.removeByPhase is an unknown removeByPhase.`));
    } else if (entry.removeByPhase <= CURRENT_PHASE) {
      issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label}.removeByPhase is already due.`));
    }
    const key = `${entry.lint}\0${entry.path}`;
    if (seen.has(key)) issues.push(diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `${label} duplicates an existing lint/path pair.`));
    seen.add(key);
  }
  return issues;
}

export function runProcess({ command, args, cwd, timeoutMs }) {
  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish({ exitCode: null, stdout, stderr, error, timedOut }));
    child.on("close", (exitCode) => finish({ exitCode, stdout, stderr, timedOut }));
    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    }
  });
}

function commandFailure(result, stage) {
  const details = { stage, suggestedFix: `Install the Rust ${stage === "format" ? "rustfmt" : "Clippy"} component and rerun pnpm check:rust.` };
  if (result?.timedOut) return diagnostic("TN_RUST_QUALITY_TIMEOUT", `Rust quality ${stage} command timed out.`, details);
  const output = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`;
  if (result?.error?.code === "ENOENT" || /no such (?:command|subcommand)|component .+ is not installed|rustfmt.+not installed|clippy.+not installed/i.test(output)) {
    return diagnostic("TN_RUST_QUALITY_TOOL_MISSING", `Required tool could not start during ${stage}.`, details);
  }
  return null;
}

function repoPath(fileName, repoRoot, workspaceDirectory, workspace) {
  const absolute = isAbsolute(fileName) ? fileName : resolve(workspaceDirectory, fileName);
  const normalized = relative(repoRoot, absolute).replaceAll("\\", "/");
  return normalized.startsWith("../") ? `${workspace}/${fileName.replace(/^\.\//, "")}` : normalized;
}

function primaryLocation(message, repoRoot, workspaceDirectory, workspace) {
  const span = message.spans?.find((candidate) => candidate.is_primary) ?? message.spans?.[0];
  return span ? { path: repoPath(span.file_name, repoRoot, workspaceDirectory, workspace), line: span.line_start, column: span.column_start } : { path: null, line: null, column: null };
}

function parseJsonLines(output) {
  const values = [];
  for (const [index, line] of output.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { values.push(JSON.parse(line)); } catch {
      throw new Error(`line ${index + 1} is not valid JSON`);
    }
  }
  return values;
}

function targetKey(packageName, targetName, kind) {
  return `${packageName}:${targetName}:${kind}`;
}

function packageNameFromId(packageId, metadataNames) {
  if (metadataNames.has(packageId)) return metadataNames.get(packageId);
  const fragment = packageId?.split("#").at(-1) ?? "unknown";
  return fragment.includes("@") ? fragment.slice(0, fragment.lastIndexOf("@")) : fragment.split(":")[0];
}

function expectedTargets(metadata) {
  const members = new Set(metadata.workspace_members ?? []);
  return (metadata.packages ?? []).filter((pkg) => members.has(pkg.id)).flatMap((pkg) =>
    (pkg.targets ?? []).flatMap((target) => (target.kind ?? []).filter((kind) => kind !== "custom-build").map((kind) => targetKey(pkg.name, target.name, kind))),
  );
}

export async function checkRustQuality({
  policy,
  repoRoot = process.cwd(),
  runCommand = runProcess,
  writeArtifacts = true,
  artifactPath = DEFAULT_REPORT,
  timeoutMs,
} = {}) {
  const startedAt = new Date().toISOString();
  const policyDiagnostics = validateRustQualityPolicy(policy);
  const reportBase = { schemaVersion: 1, startedAt, workspace: policy?.workspace ?? null, diagnostics: policyDiagnostics, findings: [], debt: [] };
  if (policyDiagnostics.length > 0) return finishReport(reportBase, [], repoRoot, artifactPath, writeArtifacts);

  const cwd = resolve(repoRoot, policy.workspace);
  const effectiveTimeout = timeoutMs ?? policy.timeoutMs;
  const commands = [
    { name: "format", args: ["fmt", "--all", "--", "--check"] },
    { name: "metadata", args: ["metadata", "--no-deps", "--format-version", "1"] },
    { name: "clippy", args: ["clippy", "--workspace", "--all-targets", "--message-format=json"] },
  ];
  const logs = [];
  const results = {};
  for (const command of commands) {
    const result = await runCommand({ command: "cargo", args: command.args, cwd, timeoutMs: effectiveTimeout });
    results[command.name] = result;
    logs.push({ name: command.name, ...result, error: result.error ? String(result.error) : undefined });
    const failure = commandFailure(result, command.name);
    if (failure) return finishReport({ ...reportBase, diagnostics: [failure] }, logs, repoRoot, artifactPath, writeArtifacts);
    if (command.name === "format" && result.exitCode !== 0) {
      return finishReport({ ...reportBase, diagnostics: [diagnostic("TN_RUST_QUALITY_FORMAT_FAILED", "cargo fmt reported formatting drift.", { stage: "format", suggestedFix: "Run cargo fmt --all in runtime-bevy and commit the result." })] }, logs, repoRoot, artifactPath, writeArtifacts);
    }
    if (command.name === "metadata" && result.exitCode !== 0) {
      return finishReport({ ...reportBase, diagnostics: [diagnostic("TN_RUST_QUALITY_METADATA_FAILED", "Cargo metadata failed.", { stage: "metadata", suggestedFix: "Fix the Cargo workspace manifest error and rerun pnpm check:rust." })] }, logs, repoRoot, artifactPath, writeArtifacts);
    }
  }

  let metadata;
  let messages;
  try {
    metadata = JSON.parse(results.metadata.stdout);
    messages = parseJsonLines(results.clippy.stdout);
  } catch (error) {
    return finishReport({ ...reportBase, diagnostics: [diagnostic("TN_RUST_QUALITY_OUTPUT_INVALID", `Cargo produced invalid structured output: ${error.message}.`, { suggestedFix: "Rerun with a supported stable Cargo and preserve --message-format=json." })] }, logs, repoRoot, artifactPath, writeArtifacts);
  }

  const metadataNames = new Map((metadata.packages ?? []).map((pkg) => [pkg.id, pkg.name]));
  const findings = [];
  const findingKeys = new Set();
  const diagnostics = [];
  const observedTargets = new Set();
  let buildFinished = false;
  let buildSucceeded = false;
  for (const item of messages) {
    if (item.reason === "build-finished") {
      buildFinished = true;
      buildSucceeded = item.success === true;
    }
    if (item.reason === "compiler-artifact") {
      const packageName = packageNameFromId(item.package_id, metadataNames);
      for (const kind of item.target?.kind ?? []) if (kind !== "custom-build") observedTargets.add(targetKey(packageName, item.target.name, kind));
    }
    if (item.reason !== "compiler-message" || !item.message) continue;
    const location = primaryLocation(item.message, repoRoot, cwd, policy.workspace);
    const lint = item.message.code?.code ?? null;
    if (item.message.level === "error") {
      diagnostics.push(diagnostic("TN_RUST_QUALITY_COMPILER_ERROR", item.message.message, { lint, ...location, suggestedFix: "Fix this Rust compiler error before evaluating Clippy debt." }));
    } else if (item.message.level === "warning" && lint) {
      const finding = {
        lint,
        ...location,
        message: item.message.message,
        package: packageNameFromId(item.package_id, metadataNames),
        target: item.target?.name ?? null,
        targetKind: [...(item.target?.kind ?? [])].sort(),
      };
      const findingKey = JSON.stringify([finding.package, finding.target, finding.targetKind, finding.lint, finding.path, finding.line, finding.column, finding.message]);
      if (!findingKeys.has(findingKey)) {
        findingKeys.add(findingKey);
        findings.push(finding);
      }
    }
  }

  const missingTargets = expectedTargets(metadata).filter((key) => !observedTargets.has(key)).sort();
  if (!buildFinished || !buildSucceeded || missingTargets.length > 0) {
    diagnostics.push(diagnostic("TN_RUST_QUALITY_INCOMPLETE_TARGETS", "Clippy did not successfully analyze every declared workspace target.", {
      missingTargets,
      buildFinished,
      buildSucceeded,
      suggestedFix: "Fix target compilation failures and rerun cargo clippy --workspace --all-targets.",
    }));
  }
  if (results.clippy.exitCode !== 0 && diagnostics.every((item) => item.code !== "TN_RUST_QUALITY_COMPILER_ERROR")) {
    diagnostics.push(diagnostic("TN_RUST_QUALITY_ANALYSIS_FAILED", "Cargo Clippy exited unsuccessfully without a compiler diagnostic.", { suggestedFix: "Inspect the Clippy artifact logs and rerun the failing command." }));
  }

  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.lint}\0${finding.path}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const allowances = new Map(policy.debt.map((entry) => [`${entry.lint}\0${entry.path}`, entry]));
  const debt = policy.debt.map((allowance) => ({ ...allowance, observed: counts.get(`${allowance.lint}\0${allowance.path}`) ?? 0 }));
  for (const [key, observed] of counts) {
    const [lint, path] = key.split("\0");
    const allowance = allowances.get(key);
    const first = findings.find((finding) => finding.lint === lint && finding.path === path);
    if (!allowance) {
      diagnostics.push(diagnostic("TN_RUST_QUALITY_NEW_FINDING", `New Rust warning ${lint} at ${path}.`, { lint, path, line: first?.line ?? null, observed, allowed: 0, suggestedFix: "Fix the finding; do not expand the debt policy for new code." }));
    } else {
      if (observed > allowance.maximum) diagnostics.push(diagnostic("TN_RUST_QUALITY_COUNT_INCREASED", `${lint} increased at ${path}: observed ${observed}, allowed ${allowance.maximum}.`, { lint, path, line: first?.line ?? null, observed, allowed: allowance.maximum, suggestedFix: "Reduce this lint/path count to its existing maximum or lower." }));
    }
  }
  for (const [key, allowance] of allowances) {
    const observed = counts.get(key) ?? 0;
    if (observed < allowance.maximum) diagnostics.push(diagnostic("TN_RUST_QUALITY_STALE_ALLOWANCE", `Debt allowance is stale for ${allowance.lint} at ${allowance.path}: observed ${observed}, allowed ${allowance.maximum}.`, { lint: allowance.lint, path: allowance.path, observed, allowed: allowance.maximum, suggestedFix: "Lower or remove this resolved lint/path entry in scripts/rust-quality-policy.json." }));
  }

  return finishReport({ ...reportBase, diagnostics, findings, debt }, logs, repoRoot, artifactPath, writeArtifacts);
}

async function finishReport(report, logs, repoRoot, artifactPath, writeArtifacts) {
  const completed = {
    ...report,
    ok: report.diagnostics.length === 0,
    completedAt: new Date().toISOString(),
    summary: {
      findings: report.findings.length,
      debtFindings: report.debt.reduce((sum, entry) => sum + entry.observed, 0),
      errors: report.diagnostics.length,
    },
    artifact: { report: artifactPath },
  };
  if (writeArtifacts) {
    const absoluteReport = resolve(repoRoot, artifactPath);
    await mkdir(dirname(absoluteReport), { recursive: true });
    for (const log of logs) {
      await writeFile(resolve(dirname(absoluteReport), `${log.name}.stdout.log`), log.stdout ?? "");
      await writeFile(resolve(dirname(absoluteReport), `${log.name}.stderr.log`), log.stderr ?? "");
    }
    await writeFile(absoluteReport, `${JSON.stringify(completed, null, 2)}\n`);
  }
  return completed;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const valueAfter = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const repoRoot = resolve(valueAfter("--root", process.cwd()));
  const policyPath = resolve(repoRoot, valueAfter("--policy", DEFAULT_POLICY));
  let policy;
  try {
    policy = JSON.parse(await readFile(policyPath, "utf8"));
  } catch (error) {
    const result = await finishReport({ schemaVersion: 1, startedAt: new Date().toISOString(), workspace: null, diagnostics: [diagnostic("TN_RUST_QUALITY_POLICY_INVALID", `Could not load policy: ${error.message}.`, { suggestedFix: `Create valid JSON at ${relative(repoRoot, policyPath)}.` })], findings: [], debt: [] }, [], repoRoot, DEFAULT_REPORT, true);
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${result.diagnostics[0].code}: ${result.diagnostics[0].message}\n`);
    process.exitCode = 1;
    return;
  }
  const result = await checkRustQuality({ policy, repoRoot });
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`${result.ok ? "PASS" : "FAIL"}: Rust quality found ${result.summary.findings} warning(s) and ${result.summary.errors} blocking diagnostic(s).\n`);
    for (const item of result.diagnostics) process.stdout.write(`${item.code}: ${item.message}\n`);
    process.stdout.write(`Report: ${result.artifact.report}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
