import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = "runtime-bevy";
const DEFAULT_REPORT = "tools/verify/artifacts/rust-quality/report.json";
export const RUST_QUALITY_COMMAND_TIMEOUT_MS = 600_000;
export const RUST_QUALITY_WRAPPER_TIMEOUT_MS = RUST_QUALITY_COMMAND_TIMEOUT_MS * 3 + 60_000;

function diagnostic(code, message, extra = {}) {
  return { code, severity: "error", message, ...extra };
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
  const details = {
    stage,
    suggestedFix: `Install the Rust ${stage === "format" ? "rustfmt" : "Clippy"} component and rerun pnpm check:rust.`,
  };
  if (result?.timedOut) {
    return diagnostic("TN_RUST_QUALITY_TIMEOUT", `Rust quality ${stage} command timed out.`, details);
  }
  const output = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}`;
  if (result?.error?.code === "ENOENT" || /no such (?:command|subcommand)|component .+ is not installed|rustfmt.+not installed|clippy.+not installed/i.test(output)) {
    return diagnostic("TN_RUST_QUALITY_TOOL_MISSING", `Required tool could not start during ${stage}.`, details);
  }
  return null;
}

function repoPath(fileName, repoRoot, workspaceDirectory) {
  const absolute = isAbsolute(fileName) ? fileName : resolve(workspaceDirectory, fileName);
  const normalized = relative(repoRoot, absolute).replaceAll("\\", "/");
  return normalized.startsWith("../") ? `${WORKSPACE}/${fileName.replace(/^\.\//, "")}` : normalized;
}

function primaryLocation(message, repoRoot, workspaceDirectory) {
  const span = message.spans?.find((candidate) => candidate.is_primary) ?? message.spans?.[0];
  return span
    ? { path: repoPath(span.file_name, repoRoot, workspaceDirectory), line: span.line_start, column: span.column_start }
    : { path: null, line: null, column: null };
}

function parseJsonLines(output) {
  const values = [];
  for (const [index, line] of output.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      values.push(JSON.parse(line));
    } catch {
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
  return (metadata.packages ?? [])
    .filter((pkg) => members.has(pkg.id))
    .flatMap((pkg) => (pkg.targets ?? []).flatMap((target) =>
      (target.kind ?? [])
        .filter((kind) => kind !== "custom-build")
        .map((kind) => targetKey(pkg.name, target.name, kind)),
    ));
}

function normalizedFinding(item, metadataNames, repoRoot, cwd) {
  return {
    lint: item.message.code?.code ?? null,
    ...primaryLocation(item.message, repoRoot, cwd),
    message: item.message.message,
    package: packageNameFromId(item.package_id, metadataNames),
    target: item.target?.name ?? null,
    targetKind: [...(item.target?.kind ?? [])].sort(),
  };
}

function isDeniedWarning(message) {
  const code = message.code?.code;
  return message.level === "warning"
    || (message.level === "error" && typeof code === "string" && !/^E\d+$/.test(code));
}

export async function checkRustQuality({
  repoRoot = process.cwd(),
  runCommand = runProcess,
  writeArtifacts = true,
  artifactPath = DEFAULT_REPORT,
  timeoutMs = RUST_QUALITY_COMMAND_TIMEOUT_MS,
} = {}) {
  const startedAt = new Date().toISOString();
  const reportBase = { schemaVersion: 2, startedAt, workspace: WORKSPACE, diagnostics: [], findings: [] };
  const cwd = resolve(repoRoot, WORKSPACE);
  const commands = [
    { name: "format", args: ["fmt", "--all", "--", "--check"] },
    { name: "metadata", args: ["metadata", "--no-deps", "--format-version", "1"] },
    {
      name: "clippy",
      args: ["clippy", "--workspace", "--all-targets", "--message-format=json", "--", "-D", "warnings"],
    },
  ];
  const logs = [];
  const results = {};
  for (const command of commands) {
    const result = await runCommand({ command: "cargo", args: command.args, cwd, timeoutMs });
    results[command.name] = result;
    logs.push({ name: command.name, ...result, error: result.error ? String(result.error) : undefined });
    const failure = commandFailure(result, command.name);
    if (failure) return finishReport({ ...reportBase, diagnostics: [failure] }, logs, repoRoot, artifactPath, writeArtifacts);
    if (command.name === "format" && result.exitCode !== 0) {
      return finishReport({
        ...reportBase,
        diagnostics: [diagnostic("TN_RUST_QUALITY_FORMAT_FAILED", "cargo fmt reported formatting drift.", {
          stage: "format",
          suggestedFix: "Run cargo fmt --all in runtime-bevy and commit the result.",
        })],
      }, logs, repoRoot, artifactPath, writeArtifacts);
    }
    if (command.name === "metadata" && result.exitCode !== 0) {
      return finishReport({
        ...reportBase,
        diagnostics: [diagnostic("TN_RUST_QUALITY_METADATA_FAILED", "Cargo metadata failed.", {
          stage: "metadata",
          suggestedFix: "Fix the Cargo workspace manifest error and rerun pnpm check:rust.",
        })],
      }, logs, repoRoot, artifactPath, writeArtifacts);
    }
  }

  let metadata;
  let messages;
  try {
    metadata = JSON.parse(results.metadata.stdout);
    messages = parseJsonLines(results.clippy.stdout);
  } catch (error) {
    return finishReport({
      ...reportBase,
      diagnostics: [diagnostic("TN_RUST_QUALITY_OUTPUT_INVALID", `Cargo produced invalid structured output: ${error.message}.`, {
        suggestedFix: "Rerun with a supported stable Cargo and preserve --message-format=json.",
      })],
    }, logs, repoRoot, artifactPath, writeArtifacts);
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
      for (const kind of item.target?.kind ?? []) {
        if (kind !== "custom-build") observedTargets.add(targetKey(packageName, item.target.name, kind));
      }
    }
    if (item.reason !== "compiler-message" || !item.message) continue;
    if (isDeniedWarning(item.message)) {
      const finding = normalizedFinding(item, metadataNames, repoRoot, cwd);
      const key = JSON.stringify(finding);
      if (!findingKeys.has(key)) {
        findingKeys.add(key);
        findings.push(finding);
        diagnostics.push(diagnostic("TN_RUST_QUALITY_WARNING", finding.message, {
          lint: finding.lint,
          path: finding.path,
          line: finding.line,
          column: finding.column,
          suggestedFix: "Fix the Rust warning; the workspace permits zero warnings.",
        }));
      }
    } else if (item.message.level === "error") {
      diagnostics.push(diagnostic("TN_RUST_QUALITY_COMPILER_ERROR", item.message.message, {
        lint: item.message.code?.code ?? null,
        ...primaryLocation(item.message, repoRoot, cwd),
        suggestedFix: "Fix this Rust compiler error and rerun pnpm check:rust.",
      }));
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
  if (results.clippy.exitCode !== 0 && diagnostics.length === 0) {
    diagnostics.push(diagnostic("TN_RUST_QUALITY_ANALYSIS_FAILED", "Cargo Clippy exited unsuccessfully without a compiler diagnostic.", {
      suggestedFix: "Inspect the Clippy artifact logs and rerun the failing command.",
    }));
  }

  return finishReport({ ...reportBase, diagnostics, findings }, logs, repoRoot, artifactPath, writeArtifacts);
}

async function finishReport(report, logs, repoRoot, artifactPath, writeArtifacts) {
  const completed = {
    ...report,
    ok: report.diagnostics.length === 0,
    completedAt: new Date().toISOString(),
    summary: { findings: report.findings.length, errors: report.diagnostics.length },
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
  const result = await checkRustQuality({ repoRoot });
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.ok ? "PASS" : "FAIL"}: Rust quality found ${result.summary.findings} warning(s) and ${result.summary.errors} blocking diagnostic(s).\n`);
    for (const item of result.diagnostics) process.stdout.write(`${item.code}: ${item.message}\n`);
    process.stdout.write(`Report: ${result.artifact.report}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
