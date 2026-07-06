import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredFiles = [
  "llms.txt",
  "llms-full.txt",
  "docs/workflows/ai-distribution.md",
];

const requiredPhrases = [
  "@threenative/sdk",
  "@threenative/ir",
  "@threenative/compiler",
  "@threenative/cli",
  "@threenative/ir/schemas/*",
  "@threenative/ir/capabilities/threenative.capabilities.json",
  "@threenative/ir/diagnostics/diagnostics.catalog.json",
  "AGENTS.md",
  "CLAUDE.md",
  "tn create",
  "tn build",
  "tn verify",
  "raw Three.js",
  "raw Bevy",
  "generated bundle",
];

test("should include required package schema diagnostic and example links in llms files", async () => {
  const docs = Object.fromEntries(await Promise.all(requiredFiles.map(async (file) => [file, await readFile(file, "utf8")])));
  const combined = Object.values(docs).join("\n");

  for (const phrase of requiredPhrases) {
    assert.match(combined, new RegExp(escapeRegExp(phrase)), `AI docs should mention '${phrase}'.`);
  }

  assert.match(docs["llms.txt"], /docs\/workflows\/ai-distribution\.md/);
  assert.match(docs["llms-full.txt"], /docs\/contracts\/distribution-contract\.md/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
