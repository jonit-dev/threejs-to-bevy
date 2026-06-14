import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { validateProject } from "./validate.js";

const cubeFixture = resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle");
const audioFixture = resolve(process.cwd(), "../ir/fixtures/conformance/v6-audio-playback/game.bundle");

test("should validate a scaffolded project config and entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-validate-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "threenative.config.json"),
      JSON.stringify({
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        schema: "threenative.project",
        version: "0.1.0",
      }),
    );
    await writeFile(join(root, "src/game.ts"), "export default {};\n");

    const result = await validateProject(["--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { code: string; entry: string };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_VALIDATE_OK");
    assert.equal(payload.entry, "src/game.ts");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject a missing scaffold entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-validate-"));
  try {
    await writeFile(
      join(root, "threenative.config.json"),
      JSON.stringify({
        entry: "src/game.ts",
        schema: "threenative.project",
        version: "0.1.0",
      }),
    );

    const result = await validateProject(["--json"], { cwd: root });
    const payload = JSON.parse(result.stderr ?? "{}") as { code: string; severity: string };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_VALIDATE_ENTRY_MISSING");
    assert.equal(payload.severity, "error");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validate should exit nonzero for invalid bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-validate-"));
  const bundle = join(root, "invalid.bundle");
  try {
    await cp(cubeFixture, bundle, { recursive: true });
    const materialsPath = join(bundle, "materials.ir.json");
    const materials = JSON.parse(await readFile(materialsPath, "utf8")) as { materials: unknown[] };
    materials.materials = [];
    await writeFile(materialsPath, `${JSON.stringify(materials, null, 2)}\n`);

    const result = await validateProject(["--bundle", bundle, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; severity: string; suggestion?: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN-IR-2104");
    assert.equal(payload.diagnostics[0]?.severity, "error");
    assert.match(payload.diagnostics[0]?.suggestion ?? "", /materials\.ir\.json/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("validate should preserve diagnostic limit and value in json output", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-validate-budget-"));
  const bundle = join(root, "audio.bundle");
  try {
    await cp(audioFixture, bundle, { recursive: true });
    const targetProfilePath = join(bundle, "target.profile.json");
    const targetProfile = JSON.parse(await readFile(targetProfilePath, "utf8")) as { budgets?: Record<string, unknown> };
    targetProfile.budgets = { maxBundleBytes: 1 };
    await writeFile(targetProfilePath, `${JSON.stringify(targetProfile, null, 2)}\n`);

    const result = await validateProject(["--bundle", bundle, "--json"], { cwd: root });
    const payload = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; limit?: number; severity: string; suggestion?: string; value?: number }>;
    };
    const diagnostic = payload.diagnostics.find((item) => item.code === "TN_IR_BUDGET_BUNDLE_BYTES_EXCEEDED");

    assert.equal(result.exitCode, 1);
    assert.equal(diagnostic?.severity, "error");
    assert.equal(diagnostic?.limit, 1);
    assert.equal(typeof diagnostic?.value, "number");
    assert.match(diagnostic?.suggestion ?? "", /Reduce copied assets/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
