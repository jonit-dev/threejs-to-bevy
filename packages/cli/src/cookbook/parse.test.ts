import test from "node:test";
import assert from "node:assert/strict";

import { parseCookbookEntry } from "./parse.js";

test("should parse entry when all four sections present", () => {
  const result = parseCookbookEntry(validEntry(), "docs/cookbook/example.md");
  assert.equal(result.ok, true);
  assert.equal(result.entry?.id, "example");
  assert.equal(result.entry?.goal, "Show the parser shape.");
  assert.equal(result.entry?.surfaces.includes("player"), true);
  assert.match(result.entry?.commands ?? "", /tn authoring validate/);
  assert.match(result.entry?.script ?? "", /export function/);
});

test("should reject entry when proof section missing", () => {
  const source = validEntry().replace(/\n## proof\n```bash\n[\s\S]*?\n```/, "");
  const result = parseCookbookEntry(source, "docs/cookbook/broken.md");
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_COOKBOOK_ENTRY_INVALID" && diagnostic.path === "/sections/proof"), true);
});

function validEntry(): string {
  return `---
id: example
goal: Show the parser shape.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - player
  - proof
---

## commands
\`\`\`bash
tn authoring validate --project . --json
\`\`\`

## source-delta
\`\`\`json
{"scene":"arena"}
\`\`\`

## script
\`\`\`ts
export function movePlayerToGoal(): void {}
\`\`\`

## proof
\`\`\`bash
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
\`\`\`
`;
}
