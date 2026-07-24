import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_NAME = /^[A-Za-z0-9_]+$/;

export function rustTestArgs(target, passthrough = []) {
  if (!target || !TEST_NAME.test(target)) {
    throw new Error("Expected a Rust integration-test target such as `rendering`.");
  }
  return [
    "test",
    "--manifest-path",
    "runtime-bevy/Cargo.toml",
    "-p",
    "threenative_runtime",
    "--test",
    target,
    ...passthrough,
  ];
}

export async function runRustTest({
  repoRoot = process.cwd(),
  argv = process.argv.slice(2),
  spawnCommand = spawn,
} = {}) {
  const forwarded = argv[0] === "--" ? argv.slice(1) : argv;
  const [target, ...passthrough] = forwarded;
  const args = rustTestArgs(target, passthrough);
  const testFile = resolve(
    repoRoot,
    "runtime-bevy",
    "crates",
    "threenative_runtime",
    "tests",
    `${target}.rs`,
  );

  try {
    await access(testFile);
  } catch {
    throw new Error(`Unknown Rust integration-test target \`${target}\`.`);
  }

  return new Promise((resolveExitCode, reject) => {
    const child = spawnCommand("cargo", args, { cwd: repoRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) {
        reject(new Error(`Cargo was terminated by ${signal}.`));
        return;
      }
      resolveExitCode(code ?? 1);
    });
  });
}

async function main() {
  try {
    process.exitCode = await runRustTest();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      "Usage: pnpm test:rust -- <integration-test-target> [test-name-filter] [-- <test-options>]\n",
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
