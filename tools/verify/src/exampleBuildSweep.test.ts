import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runExampleBuildSweep } from "./exampleBuildSweep.js";

test("should pass when build-only examples build", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-example-build-sweep-pass-"));
  try {
    await writeExample(root, "examples/build-only-ok", "node -e \"console.log('built')\"");
    const reportPath = join(root, "artifacts/example-build-sweep/report.json");

    const result = await runExampleBuildSweep({ projects: ["examples/build-only-ok"], reportPath, root, usePackageScript: true });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as { ok: boolean; steps: Array<{ name: string }> };

    assert.equal(result.ok, true);
    assert.equal(report.ok, true);
    assert.equal(report.steps[0]?.name, "build-only example: examples/build-only-ok");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when a build-only example does not build", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-example-build-sweep-fail-"));
  try {
    await writeExample(root, "examples/build-only-bad", "node -e \"process.exit(7)\"");
    const reportPath = join(root, "artifacts/example-build-sweep/report.json");

    const result = await runExampleBuildSweep({ projects: ["examples/build-only-bad"], reportPath, root, usePackageScript: true });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_EXAMPLE_BUILD_ONLY_FAILED");
    assert.equal(result.diagnostics[0]?.path, "examples/build-only-bad");
    assert.equal(result.diagnostics[0]?.step, "build-only example: examples/build-only-bad");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeExample(root: string, projectPath: string, build: string): Promise<void> {
  await mkdir(join(root, projectPath), { recursive: true });
  await writeFile(
    join(root, projectPath, "package.json"),
    `${JSON.stringify({ private: true, scripts: { build } }, null, 2)}\n`,
  );
}
