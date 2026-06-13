import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV2 } from "./check-docs-v2.mjs";

test("should list every v2 ticket", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v2-"));
  try {
    await writeFixture(root, {
      readme: [
        "# V2 PRDs",
        "verify:conformance shared fixtures",
        "pnpm verify:v2 pnpm verify:conformance pnpm check:docs:v2",
        "`ui.ir.json` `input.ir.json` `assets.manifest.json`",
        "[V2-00](./V2-00-roadmap.md)",
      ].join("\n"),
      docs: defaultScopeDocs(),
      tickets: {
        "V2-00-roadmap.md": "# V2-00\n",
        "V2-01-conformance.md": "# V2-01\n",
      },
    });

    const result = await checkDocsV2({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V2_TICKET_LINK_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject v3-only capabilities as required v2 scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v2-"));
  try {
    await writeFixture(root, {
      readme: [
        "# V2 PRDs",
        "verify:conformance shared fixtures",
        "pnpm verify:v2 pnpm verify:conformance pnpm check:docs:v2",
        "`ui.ir.json` `input.ir.json` `assets.manifest.json`",
        "[V2-00](./V2-00-roadmap.md)",
      ].join("\n"),
      docs: defaultScopeDocs(),
      tickets: {
        "V2-00-roadmap.md": "# V2-00\n\nV2 requires gamepad support.\n",
      },
    });

    const result = await checkDocsV2({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V2_SCOPE_DRIFT");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept deferred v3-only capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v2-"));
  try {
    await writeFixture(root, {
      readme: [
        "# V2 PRDs",
        "verify:conformance shared fixtures",
        "pnpm verify:v2 pnpm verify:conformance pnpm check:docs:v2",
        "`ui.ir.json` `input.ir.json` `assets.manifest.json`",
        "[V2-00](./V2-00-roadmap.md)",
      ].join("\n"),
      docs: defaultScopeDocs(),
      tickets: {
        "V2-00-roadmap.md": "# V2-00\n\nGamepad is V3 and not required for V2.\n",
      },
    });

    const result = await checkDocsV2({ repoRoot: root });

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject required v3-only scope in aligned docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v2-"));
  try {
    const docs = defaultScopeDocs();
    docs["docs/sdk.md"] = "V2 must support mobile packaging.\nui.ir.json input.ir.json assets.manifest.json\n";
    await writeFixture(root, {
      readme: [
        "# V2 PRDs",
        "verify:conformance shared fixtures",
        "pnpm verify:v2 pnpm verify:conformance pnpm check:docs:v2",
        "`ui.ir.json` `input.ir.json` `assets.manifest.json`",
        "[V2-00](./V2-00-roadmap.md)",
      ].join("\n"),
      docs,
      tickets: {
        "V2-00-roadmap.md": "# V2-00\n",
      },
    });

    const result = await checkDocsV2({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V2_SCOPE_DRIFT");
    assert.equal(result.diagnostics[0]?.file, "docs/sdk.md");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require consistent bundle names in aligned docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v2-"));
  try {
    const docs = defaultScopeDocs();
    docs["docs/ir.md"] = "ui.ir.json\ninput.ir.json\n";
    await writeFixture(root, {
      readme: [
        "# V2 PRDs",
        "verify:conformance shared fixtures",
        "pnpm verify:v2 pnpm verify:conformance pnpm check:docs:v2",
        "`ui.ir.json` `input.ir.json` `assets.manifest.json`",
        "[V2-00](./V2-00-roadmap.md)",
      ].join("\n"),
      docs,
      tickets: {
        "V2-00-roadmap.md": "# V2-00\n",
      },
    });

    const result = await checkDocsV2({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V2_BUNDLE_NAME_MISSING");
    assert.equal(result.diagnostics[0]?.file, "docs/ir.md");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require conformance guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v2-"));
  try {
    const docs = defaultScopeDocs();
    docs["AGENTS.md"] = "verify:conformance regression\n";
    await writeFixture(root, {
      readme: [
        "# V2 PRDs",
        "verify:conformance shared fixtures",
        "pnpm verify:v2 pnpm verify:conformance pnpm check:docs:v2",
        "`ui.ir.json` `input.ir.json` `assets.manifest.json`",
        "[V2-00](./V2-00-roadmap.md)",
      ].join("\n"),
      docs,
      tickets: {
        "V2-00-roadmap.md": "# V2-00\n",
      },
    });

    const result = await checkDocsV2({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V2_CONFORMANCE_GUIDANCE_MISSING");
    assert.equal(result.diagnostics[0]?.file, "AGENTS.md");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require v2 command documentation", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v2-"));
  try {
    const docs = defaultScopeDocs();
    docs["docs/developer-workflow.md"] = "verify:conformance shared conformance semantic reports\n";
    await writeFixture(root, {
      readme: [
        "# V2 PRDs",
        "verify:conformance shared fixtures",
        "pnpm verify:v2 pnpm verify:conformance pnpm check:docs:v2",
        "`ui.ir.json` `input.ir.json` `assets.manifest.json`",
        "[V2-00](./V2-00-roadmap.md)",
      ].join("\n"),
      docs,
      tickets: {
        "V2-00-roadmap.md": "# V2-00\n",
      },
    });

    const result = await checkDocsV2({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V2_COMMAND_MISSING");
    assert.equal(result.diagnostics[0]?.file, "docs/developer-workflow.md");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeFixture(root, { readme, docs = defaultScopeDocs(), tickets }) {
  const v2Dir = join(root, "docs/PRDs/v2");
  await mkdir(v2Dir, { recursive: true });
  await writeFile(join(v2Dir, "README.md"), readme);
  for (const [fileName, contents] of Object.entries(docs)) {
    await mkdir(join(root, fileName, ".."), { recursive: true });
    await writeFile(join(root, fileName), contents);
  }
  for (const [fileName, contents] of Object.entries(tickets)) {
    await writeFile(join(v2Dir, fileName), contents);
  }
}

function defaultScopeDocs() {
  const bundleNames = "ui.ir.json\ninput.ir.json\nassets.manifest.json\n";
  return {
    "AGENTS.md": "verify:conformance self-verification regression\n",
    "docs/sdk.md": bundleNames,
    "docs/ecs.md": "V2 uses fixedUpdate, update, and postUpdate.\n",
    "docs/ir.md": bundleNames,
    "docs/scripting.md": "V2 native TypeScript host proof is explicit.\n",
    "docs/developer-workflow.md": "verify:conformance shared conformance semantic reports\ntn dev --target web --watch\npnpm verify:v2\npnpm verify:conformance\npnpm check:docs:v2\n--template v2-arena\n",
    "docs/runtime-adapters.md": `${bundleNames}\nverify:conformance\nSemantic parity\nPixel-perfect visual parity is not the V2 goal\n`,
  };
}
