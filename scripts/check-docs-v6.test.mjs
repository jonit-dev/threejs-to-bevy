import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV6 } from "./check-docs-v6.mjs";

test("should require every V6 PRD link from the index", async () => {
  const root = await makeDocsRoot({ index: defaultIndex().replace("V6-05-animation-playback-contracts.md", "") });
  try {
    const result = await checkDocsV6(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V6_INDEX_LINK_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require V6 scope and evidence phrases", async () => {
  const root = await makeDocsRoot({ index: defaultIndex().replace("rendered", "") });
  try {
    const result = await checkDocsV6(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V6_SCOPE_PHRASE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported V6 product-surface claims", async () => {
  const root = await makeDocsRoot({ status: `${defaultStatus()}\nV6 includes networking support as a completed runtime feature\n` });
  try {
    const result = await checkDocsV6(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.at(-1)?.code, "TN_DOCS_V6_SCOPE_CLAIM_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require V6 status and parity pointers", async () => {
  const root = await makeDocsRoot({ parity: "verify:v6\nV7\n" });
  try {
    const result = await checkDocsV6(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V6_STATUS_PARITY_SCOPE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass V6 docs gate shape", async () => {
  const root = await makeDocsRoot();
  try {
    const result = await checkDocsV6(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeDocsRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v6-"));
  await mkdir(join(root, "docs/PRDs/v6"), { recursive: true });
  await writeFile(join(root, "docs/PRDs/v6/README.md"), overrides.index ?? defaultIndex());
  await writeFile(join(root, "docs/STATUS.md"), overrides.status ?? defaultStatus());
  await writeFile(join(root, "docs/bevy-feature-parity.md"), overrides.parity ?? defaultParity());
  return root;
}

function defaultIndex() {
  return [
    "V6-00-scope-and-contract-alignment.md",
    "V6-01-gameplay-resources-and-event-contracts.md",
    "V6-02-gameplay-system-scheduling-and-state.md",
    "V6-03-physics-colliders-and-collision-events.md",
    "V6-04-character-interaction-slice.md",
    "V6-05-animation-playback-contracts.md",
    "V6-06-retained-ui-runtime.md",
    "V6-07-audio-playback-runtime.md",
    "V6-08-asset-and-diagnostic-hardening.md",
    "V6-09-functional-v6-game-scene.md",
    "V6-10-release-gate-and-docs-consistency.md",
    "gameplay physics animation UI audio conformance Rust functional V6 scene",
    "examples/ tools/verify/artifacts/milestones/v6 rendered only builds",
    "deeper physics animation graphs rich UI/audio packaging performance",
  ].join("\n");
}

function defaultStatus() {
  return "V6 PRDs verify:v6 V7 deeper physics animation graphs richer UI/audio packaging performance\n";
}

function defaultParity() {
  return "V6 PRDs verify:v6 V7 deeper physics animation graphs richer UI/audio packaging performance\n";
}
