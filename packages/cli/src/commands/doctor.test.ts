import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { doctorCommand } from "./doctor.js";

test("should report starter project setup with missing bundle as actionable warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-doctor-ok-"));
  try {
    await writeFile(join(root, "package.json"), `${JSON.stringify({
      scripts: {
        build: "tn build",
        validate: "tn validate",
        "dev:web": "tn dev --target web",
      },
    }, null, 2)}\n`);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/game.ts"), "export const game = {};\n");
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      template: "starter",
    }, null, 2)}\n`);

    const result = await doctorCommand(["--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      checks: Array<{ code: string; nextCommand?: string; severity: string }>;
      summary: { errors: number; warnings: number };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_DOCTOR_OK");
    assert.equal(payload.summary.errors, 0);
    assert.equal(payload.summary.warnings, 1);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_ENTRY_OK"), true);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_BUNDLE_MISSING" && check.nextCommand === "pnpm run build"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report missing scripts and source as stable errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-doctor-broken-"));
  try {
    await writeFile(join(root, "package.json"), `${JSON.stringify({ scripts: { build: "tn build" } }, null, 2)}\n`);
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({ entry: "src/missing.ts" }, null, 2)}\n`);

    const result = await doctorCommand(["--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      code: string;
      checks: Array<{ code: string; message: string; severity: string }>;
      summary: { errors: number };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_DOCTOR_FAILED");
    assert.equal(payload.summary.errors, 3);
    assert.equal(payload.checks.filter((check) => check.code === "TN_DOCTOR_SCRIPT_MISSING").length, 2);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_ENTRY_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect expected bundle files when bundle exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-doctor-bundle-"));
  try {
    await writeFile(join(root, "package.json"), `${JSON.stringify({
      scripts: { build: "tn build", validate: "tn validate", "dev:web": "tn dev --target web" },
    }, null, 2)}\n`);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/game.ts"), "export const game = {};\n");
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({ entry: "src/game.ts", outDir: "dist/game.bundle" }, null, 2)}\n`);
    await mkdir(join(root, "dist/game.bundle"), { recursive: true });
    await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/assets.manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/target.profile.json"), "{}\n");

    const result = await doctorCommand(["--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { summary: { errors: number; warnings: number }; checks: Array<{ code: string }> };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.summary.errors, 0);
    assert.equal(payload.summary.warnings, 0);
    assert.equal(payload.checks.filter((check) => check.code === "TN_DOCTOR_BUNDLE_FILE_OK").length, 4);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
