import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runTemplatePlayabilityGate } from "./templatePlayability.js";
import type { CommandOptions, CommandResult } from "./runner.js";

test("should prove starter player moves on throttle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-playability-pass-"));
  try {
    const calls: string[] = [];
    const result = await runTemplatePlayabilityGate({
      root,
      run: fakeRunner({
        onCall: async (options) => {
          calls.push([options.command, ...options.args].join(" "));
          if (options.name === "create racing starter") {
            await writeInput(resolve(options.cwd, "scratch-racer"), "keyboard.KeyW");
          }
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(calls.some((command) => command.includes("playtest") && command.includes("--press KeyW") && command.includes("--expect-moved")), true);
    assert.equal(calls.some((command) => command.includes("scene proof-camera")), true);
    assert.equal(calls.some((command) => command.includes("scene proof-modular-track")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail starter with malformed input binding when validation accepts it", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-playability-malformed-"));
  try {
    const result = await runTemplatePlayabilityGate({
      root,
      run: fakeRunner({
        malformedValidationExitCode: 0,
        onCall: async (options) => {
          if (options.name === "create racing starter") {
            await writeInput(resolve(options.cwd, "scratch-racer"), "keyboard.KeyW");
          }
        },
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_TEMPLATE_PLAYABILITY_AUTHORING_VALIDATE_MALFORMED_STARTER_INPUT_UNEXPECTED_PASS"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_TEMPLATE_PLAYABILITY_MALFORMED_INPUT_ACCEPTED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function fakeRunner(options: {
  malformedValidationExitCode?: number;
  onCall?: (options: CommandOptions) => Promise<void>;
} = {}): (commandOptions: CommandOptions) => Promise<CommandResult> {
  return async (commandOptions) => {
    await options.onCall?.(commandOptions);
    const exitCode = commandOptions.name === "authoring validate malformed starter input"
      ? options.malformedValidationExitCode ?? 1
      : 0;
    return {
      durationMs: 1,
      exitCode,
      stderr: "",
      stdout: stdoutFor(commandOptions.name ?? "", exitCode),
    };
  };
}

function stdoutFor(name: string, exitCode: number): string {
  if (name === "playtest starter throttle") {
    return `${JSON.stringify({ code: "TN_PLAYTEST_OK", distance: 2.5, pass: true }, null, 2)}\n`;
  }
  if (name === "authoring validate malformed starter input" && exitCode !== 0) {
    return `${JSON.stringify({ code: "TN_AUTHORING_FAILED", diagnostics: [{ code: "TN_INPUT_KEYBOARD_CODE_INVALID", severity: "error" }] }, null, 2)}\n`;
  }
  return `${JSON.stringify({ code: "TN_OK" }, null, 2)}\n`;
}

async function writeInput(projectPath: string, binding: string): Promise<void> {
  await mkdir(join(projectPath, "content/input"), { recursive: true });
  await writeFile(
    join(projectPath, "content/input/rally.input.json"),
    `${JSON.stringify({ actions: [{ bindings: [binding], id: "accelerate" }] }, null, 2)}\n`,
  );
  assert.equal((await readFile(join(projectPath, "content/input/rally.input.json"), "utf8")).includes(binding), true);
}
