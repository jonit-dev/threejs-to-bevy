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
export function movePlayerToGoal(): void {}
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
