import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { checkRustQuality } from "./check-rust-quality.mjs";

const packageId = "path+file:///repo/runtime-bevy/crates/demo#0.1.0";

function metadataOutput(targets = [{ name: "demo", kind: ["lib"] }]) {
  return JSON.stringify({
    workspace_members: [packageId],
    packages: [{ id: packageId, name: "demo", targets }],
  });
}

function cargoOutput({ warnings = [], errors = [], artifacts = [artifact()], success = true } = {}) {
  return [...warnings, ...errors, ...artifacts, { reason: "build-finished", success }]
    .map((value) => JSON.stringify(value))
    .join("\n");
}

function warning({
  code = "clippy::too_many_arguments",
  path = "crates/demo/src/lib.rs",
  line = 10,
  message = "this function has too many arguments (9/8)",
  level = "warning",
} = {}) {
  return compilerMessage(level, code, path, line, message);
}

function compilerMessage(level, code, path, line, message) {
  return {
    reason: "compiler-message",
    package_id: packageId,
    target: { kind: ["lib"], name: "demo" },
    message: {
      level,
      code: code === null ? null : { code, explanation: null },
      message,
      rendered: `${level}: ${message}`,
      spans: [{
        file_name: path,
        line_start: line,
        column_start: 1,
        line_end: line,
        column_end: 2,
        is_primary: true,
      }],
    },
  };
}

function artifact(name = "demo", kind = "lib") {
  return {
    reason: "compiler-artifact",
    package_id: packageId,
    target: { name, kind: [kind] },
  };
}

function injectedRunner(clippy, overrides = {}) {
  const calls = [];
  const runner = async ({ args }) => {
    calls.push(args);
    if (args[0] === "fmt") return { exitCode: 0, stdout: "", stderr: "", ...overrides.fmt };
    if (args[0] === "metadata") {
      return { exitCode: 0, stdout: metadataOutput(), stderr: "", ...overrides.metadata };
    }
    return { exitCode: 0, stdout: clippy, stderr: "", ...overrides.clippy };
  };
  runner.calls = calls;
  return runner;
}

async function runWith(output, options = {}) {
  const runner = options.runCommand ?? injectedRunner(output);
  return checkRustQuality({
    repoRoot: "/repo",
    runCommand: runner,
    writeArtifacts: false,
    timeoutMs: 50,
  });
}

test("should pass a complete zero-warning workspace and use the zero-debt argv", async () => {
  const output = cargoOutput();
  const runner = injectedRunner(output);
  const result = await runWith(output, { runCommand: runner });

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, { findings: 0, errors: 0 });
  assert.equal("debt" in result, false);
  assert.deepEqual(runner.calls, [
    ["fmt", "--all", "--", "--check"],
    ["metadata", "--no-deps", "--format-version", "1"],
    ["clippy", "--workspace", "--all-targets", "--message-format=json", "--", "-D", "warnings"],
  ]);
});

test("should block and normalize a compiler warning", async () => {
  const result = await runWith(cargoOutput({ warnings: [warning()] }));

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "runtime-bevy/crates/demo/src/lib.rs");
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_WARNING");
});

test("should normalize a warning promoted to an error by -D warnings", async () => {
  const promoted = warning({ level: "error" });
  const result = await runWith(cargoOutput({ errors: [promoted], success: false }), {
    runCommand: injectedRunner(cargoOutput({ errors: [promoted], success: false }), {
      clippy: { exitCode: 101 },
    }),
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.diagnostics.some((item) => item.code === "TN_RUST_QUALITY_WARNING"), true);
});

test("should deduplicate replayed warnings", async () => {
  const repeated = warning();
  const result = await runWith(cargoOutput({ warnings: [repeated, repeated] }));
  assert.equal(result.findings.length, 1);
});

test("should preserve compiler errors", async () => {
  const error = compilerMessage("error", "E0412", "crates/demo/src/lib.rs", 4, "cannot find type `Missing`");
  const output = cargoOutput({ errors: [error], success: false });
  const result = await runWith(output, {
    runCommand: injectedRunner(output, { clippy: { exitCode: 101 } }),
  });

  const diagnostic = result.diagnostics.find((item) => item.code === "TN_RUST_QUALITY_COMPILER_ERROR");
  assert.equal(result.ok, false);
  assert.equal(diagnostic.lint, "E0412");
  assert.match(diagnostic.message, /cannot find type/);
});

test("should fail when expected targets are incomplete", async () => {
  const result = await runWith(cargoOutput({ artifacts: [] }));
  const diagnostic = result.diagnostics.find((item) => item.code === "TN_RUST_QUALITY_INCOMPLETE_TARGETS");

  assert.equal(result.ok, false);
  assert.deepEqual(diagnostic.missingTargets, ["demo:demo:lib"]);
});

test("should fail when rustfmt reports drift", async () => {
  const result = await runWith("", { runCommand: injectedRunner("", { fmt: { exitCode: 1 } }) });
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_FORMAT_FAILED");
});

test("should fail on timeout", async () => {
  const result = await runWith("", {
    runCommand: async () => ({ exitCode: null, stdout: "", stderr: "", timedOut: true }),
  });
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_TIMEOUT");
});

test("should fail when a required tool cannot start", async () => {
  const missing = Object.assign(new Error("spawn cargo ENOENT"), { code: "ENOENT" });
  const result = await runWith("", {
    runCommand: async () => ({ exitCode: null, stdout: "", stderr: "", error: missing }),
  });
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_TOOL_MISSING");
});

test("should fail when a required Rust component is not installed", async () => {
  const result = await runWith("", {
    runCommand: injectedRunner("", { fmt: { exitCode: 101, stderr: "error: no such command: `fmt`" } }),
  });
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_TOOL_MISSING");
});

test("should fail when Cargo JSON output is malformed", async () => {
  const result = await runWith("not json");
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_OUTPUT_INVALID");
});

test("should fail an unexplained unsuccessful Clippy invocation", async () => {
  const output = cargoOutput();
  const result = await runWith(output, {
    runCommand: injectedRunner(output, { clippy: { exitCode: 101 } }),
  });
  assert.equal(result.diagnostics.some((item) => item.code === "TN_RUST_QUALITY_ANALYSIS_FAILED"), true);
});

test("should write the normalized report and deep command logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rust-quality-artifacts-"));
  try {
    await mkdir(join(root, "runtime-bevy"), { recursive: true });
    const output = cargoOutput();
    const result = await checkRustQuality({ repoRoot: root, runCommand: injectedRunner(output) });
    const report = JSON.parse(await readFile(join(root, result.artifact.report), "utf8"));
    assert.equal(report.ok, true);
    assert.equal(report.schemaVersion, 2);
    assert.equal(
      await readFile(join(root, "tools/verify/artifacts/rust-quality/clippy.stdout.log"), "utf8"),
      output,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should keep json stdout pure without a policy file", async () => {
  const root = await fakeCliRoot("tn-rust-quality-cli-");
  try {
    const execution = await spawnResult(process.execPath, [
      join(process.cwd(), "scripts/check-rust-quality.mjs"),
      "--json",
      "--root", root,
    ], { PATH: `${root}:${process.env.PATH}` });

    assert.equal(execution.exitCode, 0, execution.stderr);
    assert.equal(JSON.parse(execution.stdout).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should keep public pnpm json stdout pure", async () => {
  const root = await fakeCliRoot("tn-rust-quality-pnpm-cli-");
  try {
    await writeFile(join(root, "package.json"), `${JSON.stringify({
      private: true,
      type: "module",
      scripts: { "check:rust": `node ${join(process.cwd(), "scripts/check-rust-quality.mjs")} --root .` },
    })}\n`);
    const execution = await spawnResult("pnpm", ["--silent", "check:rust", "--", "--json"], {
      PATH: `${root}:${process.env.PATH}`,
    }, root);

    assert.equal(execution.exitCode, 0, execution.stderr);
    assert.equal(JSON.parse(execution.stdout).ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function fakeCliRoot(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "runtime-bevy"), { recursive: true });
  const cargo = join(root, "cargo");
  await writeFile(cargo, `#!/bin/sh\nif [ "$1" = "metadata" ]; then\n  printf '%s\\n' '${metadataOutput().replaceAll("'", "'\\''")}'\nelif [ "$1" = "clippy" ]; then\n  printf '%s\\n' '${cargoOutput().replaceAll("'", "'\\''")}'\nfi\n`);
  await chmod(cargo, 0o755);
  return root;
}

function spawnResult(command, args, env, cwd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
  });
}
