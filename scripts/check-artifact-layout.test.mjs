import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkArtifactLayout } from "./check-artifact-layout.mjs";

test("should reject example-specific root artifact paths", async () => {
  const root = await makeRepoRoot({
    "artifacts/native-ui-effects/report.json": "{}\n",
  });

  try {
    const result = await checkArtifactLayout({ root });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_ARTIFACT_LAYOUT_ROOT_ARTIFACT"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow aggregate release and conformance reports", async () => {
  const root = await makeRepoRoot({
    "packages/ir/artifacts/conformance/verification-report.json": "{}\n",
    "tools/verify/artifacts/release/verification-report.json": "{}\n",
  });

  try {
    const result = await checkArtifactLayout({ root });
    assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject tmp artifact paths", async () => {
  const root = await makeRepoRoot({
    "tmp/simple-game/artifacts/report.json": "{}\n",
  });

  try {
    const result = await checkArtifactLayout({ root });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_ARTIFACT_LAYOUT_TMP_ARTIFACT"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject generated template artifacts", async () => {
  const root = await makeRepoRoot({
    "templates/starter/artifacts/report.json": "{}\n",
  });

  try {
    const result = await checkArtifactLayout({ root });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_ARTIFACT_LAYOUT_TEMPLATE_GENERATED_ARTIFACT"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow concise repo agent guidance near the size budget", async () => {
  const root = await makeRepoRoot({
    "AGENTS.md": `# AGENTS.md\n\n${"Use concise local guidance.\n".repeat(520)}`,
  });

  try {
    const result = await checkArtifactLayout({ root });
    assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require verifier artifact directories to use resolver ownership", async () => {
  const files = (await readdir("scripts"))
    .filter((file) => /^verify.*\.mjs$/.test(file) && !file.endsWith(".test.mjs"))
    .map((file) => `scripts/${file}`);

  const offenders = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (/const .*artifactDir.*tools\/verify\/artifacts\//.test(content) || /resolve\([^\n]+"tools\/verify\/artifacts\//.test(content)) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, []);
});

async function makeRepoRoot(files) {
  const root = await mkdtemp(join(tmpdir(), "tn-artifact-layout-"));

  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  return root;
}
