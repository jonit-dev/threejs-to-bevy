import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { materializeCookbookFixtureManifest, runCookbookGate, validateCookbookCommand, validateCookbookFixtureReviewMetadata, validatePhysicsCookbookReferences } from "./cookbookGate.js";

test("should materialize bounded fixture manifests with ordered hash references", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-root-"));
  const project = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-project-"));
  try {
    await mkdir(join(root, "evidence"), { recursive: true });
    await writeFile(join(root, "evidence", "fixture.json"), `${JSON.stringify({
      schema: "threenative.cookbook-fixture",
      version: "0.1.0",
      files: [
        { path: "content/input.txt", text: "reviewed\n" },
        { path: "content/record.json", json: { inputHash: "{{sha256:content/input.txt}}" } },
      ],
    }, null, 2)}\n`);
    await materializeCookbookFixtureManifest(root, project, "evidence/fixture.json");
    assert.equal(await readFile(join(project, "content", "input.txt"), "utf8"), "reviewed\n");
    assert.match(await readFile(join(project, "content", "record.json"), "utf8"), /"inputHash": "sha256:[a-f0-9]{64}"/u);
  } finally {
    await Promise.all([rm(root, { force: true, recursive: true }), rm(project, { force: true, recursive: true })]);
  }
});

test("should reject fixture paths outside the clean cookbook project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-escape-root-"));
  const project = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-escape-project-"));
  const outside = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-outside-"));
  try {
    await writeFile(join(root, "fixture.json"), `${JSON.stringify({
      schema: "threenative.cookbook-fixture",
      version: "0.1.0",
      files: [{ path: "../escape.txt", text: "blocked" }],
    })}\n`);
    await assert.rejects(materializeCookbookFixtureManifest(root, project, "fixture.json"), /fixture file path escapes its owner/u);
    await mkdir(join(project, "content"), { recursive: true });
    await symlink(outside, join(project, "content", "linked"));
    await writeFile(join(root, "fixture.json"), `${JSON.stringify({
      schema: "threenative.cookbook-fixture",
      version: "0.1.0",
      files: [{ path: "content/linked/escape.txt", text: "blocked" }],
    })}\n`);
    await assert.rejects(materializeCookbookFixtureManifest(root, project, "fixture.json"), /fixture file parent path escapes its owner through a symbolic link/u);
  } finally {
    await Promise.all([rm(root, { force: true, recursive: true }), rm(project, { force: true, recursive: true }), rm(outside, { force: true, recursive: true })]);
  }
});

test("should reject canonical duplicate fixture paths and malformed content", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-invalid-root-"));
  const project = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-invalid-project-"));
  try {
    await writeFile(join(root, "fixture.json"), `${JSON.stringify({
      schema: "threenative.cookbook-fixture",
      version: "0.1.0",
      files: [{ path: "content/a/../same.txt", text: "first" }, { path: "content/same.txt", text: "second" }],
    })}\n`);
    await assert.rejects(materializeCookbookFixtureManifest(root, project, "fixture.json"), /duplicate fixture path 'content\/same\.txt'/u);
    await writeFile(join(root, "fixture.json"), `${JSON.stringify({
      schema: "threenative.cookbook-fixture",
      version: "0.1.0",
      files: [{ path: "content/bad.bin", base64: "not base64" }],
    })}\n`);
    await assert.rejects(materializeCookbookFixtureManifest(root, project, "fixture.json"), /base64 content is invalid/u);
    await writeFile(join(root, "fixture.json"), `${JSON.stringify({
      schema: "threenative.cookbook-fixture",
      version: "0.1.0",
      files: [{ path: "content/bad.txt", text: 42 }],
    })}\n`);
    await assert.rejects(materializeCookbookFixtureManifest(root, project, "fixture.json"), /text content must be a string/u);
  } finally {
    await Promise.all([rm(root, { force: true, recursive: true }), rm(project, { force: true, recursive: true })]);
  }
});

test("should require rights and an accepted review for local reviewed fixtures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-review-root-"));
  try {
    await writeFile(join(root, "fixture.json"), `${JSON.stringify({ schema: "threenative.cookbook-fixture", version: "0.1.0", files: [{ path: "input.txt", text: "x" }] })}\n`);
    await assert.rejects(validateCookbookFixtureReviewMetadata(root, "fixture.json"), /requires rights, reviewedSource, and manualCompositionReview metadata/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject drift between a fixture-owned file and a cookbook script", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cookbook-fixture-drift-root-"));
  const entriesDir = join(root, "entries");
  const templateDir = join(root, "template");
  try {
    await Promise.all([mkdir(entriesDir, { recursive: true }), mkdir(templateDir, { recursive: true })]);
    await writeFile(join(root, "fixture.json"), `${JSON.stringify({ schema: "threenative.cookbook-fixture", version: "0.1.0", files: [{ path: "src/owned.ts", text: "export const owner = 1;\n" }] })}\n`);
    await writeFile(join(entriesDir, "drift.md"), `---\nid: drift\ngoal: Reject drift.\ncategory: test\nfixtureManifest: fixture.json\nscriptPath: src/owned.ts\n---\n\n## commands\n\`\`\`bash\n# none\n\`\`\`\n\n## script\n\`\`\`ts\nexport const owner = 2;\n\`\`\`\n`);
    const report = await runCookbookGate({ entriesDir, root, templateDir });
    assert.equal(report.ok, false);
    assert.equal(report.entries[0]?.diagnostics[0]?.code, "TN_COOKBOOK_GATE_FIXTURE_SCRIPT_CONFLICT");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass when all entries apply and build", async () => {
  const report = await runCookbookGate();
  assert.equal(report.ok, true);
  assert.equal(report.entries.length >= 16, true);
  assert.equal(report.entries.some((entry) => entry.entryId === "player-move-wasd"), true);
});

test("should reject drift from descriptor-owned advanced physics cookbook references", () => {
  const diagnostics = validatePhysicsCookbookReferences(new Set(["advanced-physics-aerodynamics"]), "docs/cookbook");
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_COOKBOOK_GATE_PHYSICS_DESCRIPTOR_DRIFT" && diagnostic.message.includes("advanced-physics-destruction")), true);
  assert.deepEqual(validateCookbookCommand("advanced-physics-destruction", "tn physics destructible validate arena wall --project . --json"), []);
});

test("should fail with entry id when a command is invalid", async () => {
  const entriesDir = join(tmpdir(), `tn-cookbook-invalid-${Date.now()}`);
  await mkdir(entriesDir, { recursive: true });
  await writeFile(
    join(entriesDir, "bad.md"),
    `---
id: bad-entry
goal: Fail on purpose.
category: test
scriptPath: src/scripts/player.ts
surfaces:
  - test
---

## commands
\`\`\`bash
tn scene missing-command arena --project . --json
\`\`\`

## source-delta
\`\`\`json
{}
\`\`\`

## script
\`\`\`ts
export function movePlayerToGoal(): void { return; }
\`\`\`

## proof
\`\`\`bash
tn authoring validate --project . --json
\`\`\`
`,
    "utf8",
  );
  const report = await runCookbookGate({ entriesDir });
  assert.equal(report.ok, false);
  assert.equal(report.entries[0]?.entryId, "bad-entry");
  assert.equal(report.entries[0]?.diagnostics[0]?.code, "TN_COOKBOOK_GATE_COMMAND_FAILED");
});

test("should compile typed spec cookbook entries before validate and build", async () => {
  const entriesDir = join(tmpdir(), `tn-cookbook-typed-spec-${Date.now()}`);
  await mkdir(entriesDir, { recursive: true });
  await writeFile(
    join(entriesDir, "typed-spec.md"),
    `---
id: typed-spec-entry
goal: Compile a typed spec cookbook entry.
category: typed-spec
authoring: typed-spec
scriptPath: src/game.spec.ts
surfaces:
  - typed-spec
---

## commands
\`\`\`bash
# spec is written from the script block before typed-spec compilation
\`\`\`

## source-delta
\`\`\`json
{"src/game.spec.ts":"Defines input, resource, entity transform, and UI binding in one typed source file."}
\`\`\`

## script
\`\`\`ts
import { defineTypedGameSpec } from "@threenative/sdk";

export default defineTypedGameSpec({
  input: { axes: [{ id: "move-x", negative: ["keyboard.KeyA"], positive: ["keyboard.KeyD"] }], id: "arena" },
  scenes: [{
    entities: [{ id: "player", transform: { position: [1, 0.5, 0] } }],
    id: "arena",
    resources: [{ id: "score", value: 0 }],
    ui: {
      bindings: [{ node: "score-label", resource: "score" }],
      nodes: [{ id: "score-label", text: "Score", type: "text" }],
    },
  }],
});

\`\`\`

## proof
\`\`\`bash
tn authoring compile-typed-spec --project . --json
\`\`\`
`,
    "utf8",
  );
  const report = await runCookbookGate({ entriesDir });
  assert.equal(report.ok, true);
  assert.equal(report.entries[0]?.commands.some((command) => command.command === "tn authoring compile-typed-spec --project . --json"), true);
});

test("should verify the generated SFX cookbook without a live provider", async () => {
  const report = await runCookbookGate();
  const entry = report.entries.find((candidate) => candidate.entryId === "sound-cue");
  assert.equal(entry?.ok, true);
  assert.equal(entry?.commands.some((command) => command.command.startsWith("tn audio generate-sfx ")), false);
});
