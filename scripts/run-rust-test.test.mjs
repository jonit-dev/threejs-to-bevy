import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runRustTest, rustTestArgs } from "./run-rust-test.mjs";

test("builds an explicitly scoped Cargo integration-test command", () => {
  assert.deepEqual(rustTestArgs("rendering", ["balanced", "--", "--exact"]), [
    "test",
    "--manifest-path",
    "runtime-bevy/Cargo.toml",
    "-p",
    "threenative_runtime",
    "--test",
    "rendering",
    "balanced",
    "--",
    "--exact",
  ]);
});

test("rejects missing and option-shaped targets", () => {
  assert.throws(() => rustTestArgs(), /Expected a Rust integration-test target/);
  assert.throws(() => rustTestArgs("--workspace"), /Expected a Rust integration-test target/);
});

test("rejects unknown integration-test targets before spawning Cargo", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rust-test-"));
  try {
    await assert.rejects(
      runRustTest({ repoRoot: root, argv: ["not_a_target"] }),
      /Unknown Rust integration-test target/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("spawns Cargo only after resolving a real target", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rust-test-"));
  const testDirectory = join(
    root,
    "runtime-bevy",
    "crates",
    "threenative_runtime",
    "tests",
  );
  await mkdir(testDirectory, { recursive: true });
  await writeFile(join(testDirectory, "rendering.rs"), "");

  const calls = [];
  const spawnCommand = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0, null));
    return child;
  };

  try {
    assert.equal(
      await runRustTest({
        repoRoot: root,
        argv: ["--", "rendering", "balanced"],
        spawnCommand,
      }),
      0,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "cargo");
    assert.deepEqual(calls[0].args, rustTestArgs("rendering", ["balanced"]));
    assert.equal(calls[0].options.cwd, root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
