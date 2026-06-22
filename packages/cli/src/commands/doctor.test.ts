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
      devDependencies: {
        "@threenative/cli": "0.1.9",
      },
      scripts: {
        build: "tn build",
        validate: "tn validate",
        "dev:web": "tn dev --target web",
      },
    }, null, 2)}\n`);
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
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
      devDependencies: { "@threenative/cli": "0.1.9" },
      scripts: { build: "tn build", validate: "tn validate", "dev:web": "tn dev --target web" },
    }, null, 2)}\n`);
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/game.ts"), "export const game = {};\n");
    await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({ entry: "src/game.ts", outDir: "dist/game.bundle" }, null, 2)}\n`);
    await mkdir(join(root, "dist/game.bundle"), { recursive: true });
    await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/assets.manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/materials.ir.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/target.profile.json"), "{}\n");

    const result = await doctorCommand(["--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { summary: { errors: number; warnings: number }; checks: Array<{ code: string }> };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.summary.errors, 0);
    assert.equal(payload.summary.warnings, 0);
    assert.equal(payload.checks.filter((check) => check.code === "TN_DOCTOR_BUNDLE_FILE_OK").length, 5);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should inspect manifest-declared bundle files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-doctor-manifest-"));
  try {
    await writeRunnableProject(root);
    await mkdir(join(root, "dist/game.bundle"), { recursive: true });
    await writeFile(join(root, "dist/game.bundle/manifest.json"), `${JSON.stringify({
      entry: { scripts: "scripts.bundle.js", world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", runtimeConfig: "runtime.config.json", targetProfile: "target.profile.json" },
    }, null, 2)}\n`);
    await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/assets.manifest.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/materials.ir.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/target.profile.json"), "{}\n");
    await writeFile(join(root, "dist/game.bundle/runtime.config.json"), "{}\n");

    const result = await doctorCommand(["--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { checks: Array<{ code: string; path: string }> };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_BUNDLE_FILE_MISSING" && check.path.endsWith("scripts.bundle.js")), true);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_BUNDLE_FILE_OK" && check.path.endsWith("runtime.config.json")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should probe preview runtime readiness when url is provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-doctor-preview-"));
  try {
    await writeRunnableProject(root);
    await writeBundle(root);
    const html = encodeURIComponent(`<!doctype html><canvas width="1280" height="720"></canvas><script>
      globalThis.__THREENATIVE_READY__ = {
        ok: true,
        diagnostics: [],
        runtimeDiagnostics: { assets: { resourceFailures: [] }, scene: { visibleMeshCount: 3 } }
      };
    </script>`);

    const result = await doctorCommand(["--project", root, "--url", `data:text/html,${html}`, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      checks: Array<{ code: string; message: string; severity: string }>;
      summary: { errors: number };
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.summary.errors, 0);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_PREVIEW_CANVAS_OK"), true);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_PREVIEW_READY_OK" && check.message.includes("3 visible meshes")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report preview resource failures from runtime readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-doctor-preview-failed-"));
  try {
    await writeRunnableProject(root);
    await writeBundle(root);
    const html = encodeURIComponent(`<!doctype html><canvas width="1280" height="720"></canvas><script>
      globalThis.__THREENATIVE_READY__ = {
        ok: true,
        diagnostics: [],
        runtimeDiagnostics: { assets: { resourceFailures: [{ code: "TN_WEB_MODEL_LOAD_FAILED" }] }, scene: { visibleMeshCount: 1 } }
      };
    </script>`);

    const result = await doctorCommand(["--project", root, "--url", `data:text/html,${html}`, "--json"]);
    const payload = JSON.parse(result.stdout) as {
      checks: Array<{ code: string; severity: string }>;
      summary: { errors: number };
    };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.summary.errors, 1);
    assert.equal(payload.checks.some((check) => check.code === "TN_DOCTOR_PREVIEW_RESOURCE_FAILURES" && check.severity === "error"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeRunnableProject(root: string): Promise<void> {
  await writeFile(join(root, "package.json"), `${JSON.stringify({
    devDependencies: { "@threenative/cli": "0.1.9" },
    scripts: { build: "tn build", validate: "tn validate", "dev:web": "tn dev --target web" },
  }, null, 2)}\n`);
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/game.ts"), "export const game = {};\n");
  await writeFile(join(root, "threenative.config.json"), `${JSON.stringify({ entry: "src/game.ts", outDir: "dist/game.bundle", template: "starter" }, null, 2)}\n`);
}

async function writeBundle(root: string): Promise<void> {
  await mkdir(join(root, "dist/game.bundle"), { recursive: true });
  await writeFile(join(root, "dist/game.bundle/manifest.json"), "{}\n");
  await writeFile(join(root, "dist/game.bundle/world.ir.json"), "{}\n");
  await writeFile(join(root, "dist/game.bundle/assets.manifest.json"), "{}\n");
  await writeFile(join(root, "dist/game.bundle/materials.ir.json"), "{}\n");
  await writeFile(join(root, "dist/game.bundle/target.profile.json"), "{}\n");
}
