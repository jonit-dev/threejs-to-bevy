import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  checkRustQuality,
  validateRustQualityPolicy,
} from "./check-rust-quality.mjs";

const packageId = "path+file:///repo/runtime-bevy/crates/demo#0.1.0";

function policy(overrides = {}) {
  return {
    version: 1,
    workspace: "runtime-bevy",
    timeoutMs: 600_000,
    allowedRemoveByPhases: [5, 6],
    debt: [{
      lint: "clippy::too_many_arguments",
      path: "runtime-bevy/crates/demo/src/lib.rs",
      maximum: 1,
      reason: "Existing maintainability debt is removed in bounded slices.",
      removeByPhase: 6,
    }],
    ...overrides,
  };
}

function metadataOutput(targets = [{ name: "demo", kind: ["lib"] }]) {
  return JSON.stringify({
    workspace_members: [packageId],
    packages: [{ id: packageId, name: "demo", targets }],
  });
}

function cargoOutput({ warnings = [warning()], errors = [], artifacts = [artifact()], success = true } = {}) {
  return [...warnings, ...errors, ...artifacts, { reason: "build-finished", success }]
    .map((value) => JSON.stringify(value))
    .join("\n");
}

function warning({
  code = "clippy::too_many_arguments",
  path = "crates/demo/src/lib.rs",
  line = 10,
  message = "this function has too many arguments (9/8)",
} = {}) {
  return compilerMessage("warning", code, path, line, message);
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
      spans: [{ file_name: path, line_start: line, column_start: 1, line_end: line, column_end: 2, is_primary: true }],
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
    if (args[0] === "fmt") {
      return { exitCode: 0, stdout: "", stderr: "", ...overrides.fmt };
    }
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
    policy: options.policy ?? policy(),
    repoRoot: "/repo",
    runCommand: runner,
    writeArtifacts: false,
    timeoutMs: 50,
  });
}

test("should pass when findings stay within baseline", async () => {
  const runner = injectedRunner(cargoOutput());
  const result = await runWith(cargoOutput(), { runCommand: runner });

  assert.equal(result.ok, true);
  assert.equal(result.summary.debtFindings, 1);
  assert.equal(result.debt[0].observed, 1);
  assert.deepEqual(runner.calls, [
    ["fmt", "--all", "--", "--check"],
    ["metadata", "--no-deps", "--format-version", "1"],
    ["clippy", "--workspace", "--all-targets", "--message-format=json"],
  ]);
});

test("should fail for a new lint/path pair", async () => {
  const output = cargoOutput({ warnings: [warning(), warning({ code: "clippy::clone_on_copy", line: 20 })] });
  const result = await runWith(output);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((item) => item.code === "TN_RUST_QUALITY_NEW_FINDING"), true);
});

test("should fail when a count increases", async () => {
  const output = cargoOutput({ warnings: [warning(), warning({ line: 20 })] });
  const result = await runWith(output);
  const diagnostic = result.diagnostics.find((item) => item.code === "TN_RUST_QUALITY_COUNT_INCREASED");

  assert.equal(result.ok, false);
  assert.equal(diagnostic.observed, 2);
  assert.equal(diagnostic.allowed, 1);
});

test("should fail for stale debt", async () => {
  const result = await runWith(cargoOutput({ warnings: [] }));

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((item) => item.code === "TN_RUST_QUALITY_STALE_ALLOWANCE"), true);
  assert.equal(result.debt[0].observed, 0);
});

test("should fail for a partially unused allowance", async () => {
  const result = await runWith(cargoOutput(), {
    policy: policy({ debt: [{ ...policy().debt[0], maximum: 2 }] }),
  });
  const diagnostic = result.diagnostics.find((item) => item.code === "TN_RUST_QUALITY_STALE_ALLOWANCE");

  assert.equal(result.ok, false);
  assert.equal(diagnostic.observed, 1);
  assert.equal(diagnostic.allowed, 2);
  assert.equal(result.debt[0].observed, 1);
});

test("should ratchet exact non-Clippy compiler warning codes", async () => {
  const output = cargoOutput({ warnings: [warning({ code: "dead_code", message: "function is never used" })] });
  const result = await runWith(output, { policy: policy({ debt: [{ ...policy().debt[0], lint: "dead_code" }] }) });

  assert.equal(result.ok, true);
  assert.equal(result.findings[0].lint, "dead_code");
});

test("should deduplicate replayed compiler warnings before counting", async () => {
  const repeated = warning();
  const result = await runWith(cargoOutput({ warnings: [repeated, repeated] }));

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.debt[0].observed, 1);
});

test("should preserve compiler errors", async () => {
  const error = compilerMessage("error", null, "crates/demo/src/lib.rs", 4, "cannot find type `Missing`");
  const result = await runWith(cargoOutput({ errors: [error], success: false }), {
    runCommand: injectedRunner(cargoOutput({ errors: [error], success: false }), { clippy: { exitCode: 101 } }),
  });

  assert.equal(result.ok, false);
  const diagnostic = result.diagnostics.find((item) => item.code === "TN_RUST_QUALITY_COMPILER_ERROR");
  assert.equal(diagnostic.lint, null);
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
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_FORMAT_FAILED");
});

test("should fail on timeout", async () => {
  const result = await runWith("", {
    runCommand: async () => ({ exitCode: null, stdout: "", stderr: "", timedOut: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_TIMEOUT");
});

test("should fail when a required tool cannot start", async () => {
  const missing = Object.assign(new Error("spawn cargo ENOENT"), { code: "ENOENT" });
  const result = await runWith("", {
    runCommand: async () => ({ exitCode: null, stdout: "", stderr: "", error: missing }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_TOOL_MISSING");
});

test("should fail when a required Rust component is not installed", async () => {
  const result = await runWith("", {
    runCommand: injectedRunner("", { fmt: { exitCode: 101, stderr: "error: no such command: `fmt`" } }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_TOOL_MISSING");
});

test("should reject malformed, duplicate, wildcard, negative, and unknown-phase policy entries", () => {
  const invalid = policy({
    timeoutMs: 1,
    allowedRemoveByPhases: [2, 5, 6],
    debt: [
      policy().debt[0],
      { ...policy().debt[0] },
      { ...policy().debt[0], lint: "clippy::*", path: "../runtime-bevy/**", maximum: -1, removeByPhase: 99 },
      { ...policy().debt[0], lint: "clippy::old", path: "runtime-bevy/old.rs", removeByPhase: 2 },
    ],
  });
  const diagnostics = validateRustQualityPolicy(invalid);

  assert.equal(diagnostics.some((item) => item.message.includes("duplicate")), true);
  assert.equal(diagnostics.some((item) => item.message.includes("checker-owned 600000ms")), true);
  assert.equal(diagnostics.some((item) => item.message.includes("wildcard")), true);
  assert.equal(diagnostics.some((item) => item.message.includes("non-negative integer")), true);
  assert.equal(diagnostics.some((item) => item.message.includes("unknown removeByPhase")), true);
});

test("should reject a policy that tries to authorize its own future removal phase", () => {
  const diagnostics = validateRustQualityPolicy(policy({
    allowedRemoveByPhases: [5, 6, 99],
    debt: [{ ...policy().debt[0], removeByPhase: 99 }],
  }));

  assert.equal(diagnostics.some((item) => item.message.includes("code-owned phase set [5, 6]")), true);
  assert.equal(diagnostics.some((item) => item.message.includes("unknown removeByPhase")), true);
});

test("should fail when Cargo JSON output is malformed", async () => {
  const result = await runWith("not json");
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "TN_RUST_QUALITY_OUTPUT_INVALID");
});

test("should write the normalized report and deep command logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rust-quality-artifacts-"));
  try {
    await mkdir(join(root, "runtime-bevy"), { recursive: true });
    const result = await checkRustQuality({ policy: policy(), repoRoot: root, runCommand: injectedRunner(cargoOutput()) });
    const report = JSON.parse(await readFile(join(root, result.artifact.report), "utf8"));
    assert.equal(report.ok, true);
    assert.equal(await readFile(join(root, "tools/verify/artifacts/rust-quality/clippy.stdout.log"), "utf8"), cargoOutput());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should keep json stdout pure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rust-quality-cli-"));
  try {
    await mkdir(join(root, "runtime-bevy"), { recursive: true });
    await writeFile(join(root, "policy.json"), `${JSON.stringify(policy())}\n`);
    const cargo = join(root, "cargo");
    await writeFile(cargo, `#!/bin/sh\nif [ "$1" = "metadata" ]; then\n  printf '%s\\n' '${metadataOutput().replaceAll("'", "'\\''")}'\nelif [ "$1" = "clippy" ]; then\n  printf '%s\\n' '${cargoOutput().replaceAll("'", "'\\''")}'\nfi\n`);
    await chmod(cargo, 0o755);

    const execution = await spawnResult(process.execPath, [
      join(process.cwd(), "scripts/check-rust-quality.mjs"),
      "--json",
      "--root", root,
      "--policy", join(root, "policy.json"),
    ], { PATH: `${root}:${process.env.PATH}` });

    assert.equal(execution.exitCode, 0, execution.stderr);
    const parsed = JSON.parse(execution.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(execution.stdout.trim().split("\n").length > 1, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should keep public pnpm json stdout pure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rust-quality-pnpm-cli-"));
  try {
    await mkdir(join(root, "runtime-bevy"), { recursive: true });
    await writeFile(join(root, "policy.json"), `${JSON.stringify(policy())}\n`);
    await writeFile(join(root, "package.json"), `${JSON.stringify({
      private: true,
      type: "module",
      scripts: {
        "check:rust": `node ${join(process.cwd(), "scripts/check-rust-quality.mjs")} --root . --policy policy.json`,
      },
    })}\n`);
    const cargo = join(root, "cargo");
    await writeFile(cargo, `#!/bin/sh\nif [ "$1" = "metadata" ]; then\n  printf '%s\\n' '${metadataOutput().replaceAll("'", "'\\''")}'\nelif [ "$1" = "clippy" ]; then\n  printf '%s\\n' '${cargoOutput().replaceAll("'", "'\\''")}'\nfi\n`);
    await chmod(cargo, 0o755);

    const execution = await spawnResult("pnpm", ["--silent", "check:rust", "--", "--json"], {
      PATH: `${root}:${process.env.PATH}`,
    }, root);

    assert.equal(execution.exitCode, 0, execution.stderr);
    const parsed = JSON.parse(execution.stdout);
    assert.equal(parsed.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function spawnResult(command, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}
