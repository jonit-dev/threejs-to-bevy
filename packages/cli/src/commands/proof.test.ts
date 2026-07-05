import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProofManifest } from "../game/proofManifest.js";
import { proofCommand, proveCommand } from "./proof.js";

test("prove changed reports read-only recommendations and can write manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-prove-command-"));
  try {
    await mkdir(join(root, "content"), { recursive: true });
    await writeFile(join(root, "content", "arena.scene.json"), "{}\n");

    const readOnly = await proveCommand(["changed", "--project", root, "--json"]);
    const readOnlyPayload = JSON.parse(readOnly.stdout) as {
      manifestPath: string;
      mutate: boolean;
      recommendations: Array<{ id: string }>;
    };
    assert.equal(readOnly.exitCode, 0);
    assert.equal(readOnlyPayload.mutate, false);
    assert.equal(readOnlyPayload.recommendations.some((recommendation) => recommendation.id === "validate-source"), true);

    const write = await proveCommand(["changed", "--project", root, "--write-manifest", "--json"]);
    const writePayload = JSON.parse(write.stdout) as { manifestPath: string; mutate: boolean };
    const manifest = JSON.parse(await readFile(writePayload.manifestPath, "utf8")) as { schema: string };
    assert.equal(write.exitCode, 0);
    assert.equal(writePayload.mutate, true);
    assert.equal(manifest.schema, "threenative.proof-manifest");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("proof diff command compares manifest artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-proof-diff-command-"));
  try {
    await mkdir(join(root, "content"), { recursive: true });
    await writeFile(join(root, "content", "arena.scene.json"), "{}\n");
    const from = await buildProofManifest({ projectPath: root });
    const fromPath = join(root, "from.json");
    await writeFile(fromPath, `${JSON.stringify(from, null, 2)}\n`);
    await writeFile(join(root, "content", "arena.scene.json"), "{\"changed\":true}\n");
    const to = await buildProofManifest({ projectPath: root });
    const toPath = join(root, "to.json");
    await writeFile(toPath, `${JSON.stringify(to, null, 2)}\n`);

    const result = await proofCommand(["diff", "--from", fromPath, "--to", toPath, "--json"]);
    const payload = JSON.parse(result.stdout) as { changed: Array<{ to: { path: string } }>; code: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_PROOF_DIFF");
    assert.equal(payload.changed[0]?.to.path, "content/arena.scene.json");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("prove changed run executes owned recommendations and skips placeholders", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-prove-run-command-"));
  try {
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await writeFile(join(root, "src", "scripts", "player.ts"), "export function update() {}\n");
    const previous = await buildProofManifest({ projectPath: root });
    const previousPath = join(root, "previous.json");
    await writeFile(previousPath, `${JSON.stringify(previous, null, 2)}\n`);
    await writeFile(join(root, "src", "scripts", "player.ts"), "export function update(): void {}\n");

    const result = await proveCommand(["changed", "--project", root, "--previous", previousPath, "--run", "--json"]);
    const payload = JSON.parse(result.stdout) as {
      mutate: boolean;
      runSteps: Array<{ code: string; id: string; ran: boolean }>;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.mutate, true);
    assert.equal(payload.runSteps.some((step) => step.id === "validate-source" && step.ran), true);
    assert.equal(payload.runSteps.some((step) => step.id === "build-bundle" && step.ran), true);
    assert.equal(payload.runSteps.some((step) => step.id === "run-playtest" && !step.ran && step.code === "TN_PROVE_RUN_PLACEHOLDER"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
