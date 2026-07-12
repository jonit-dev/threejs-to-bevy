import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { runCookbookGate } from "./cookbookGate.js";

test("should pass when all entries apply and build", async () => {
  const report = await runCookbookGate();
  assert.equal(report.ok, true);
  assert.equal(report.entries.length >= 16, true);
  assert.equal(report.entries.some((entry) => entry.entryId === "player-move-wasd"), true);
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
