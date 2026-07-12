import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadProjectEnvironment, ProjectEnvironmentError } from "./projectEnvironment.js";

test("should load ELEVENLABS_API_KEY from the selected generated project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-project-env-"));
  const secret = "project-sentinel-secret";
  try {
    await writeFile(join(root, ".env"), `ELEVENLABS_API_KEY=${secret}\n`, "utf8");
    const result = await loadProjectEnvironment({ processEnvironment: {}, projectPath: root });

    assert.equal(result.environment.ELEVENLABS_API_KEY, secret);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(result.envFilePath, join(root, ".env"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve process environment precedence over project dotenv", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-project-env-precedence-"));
  try {
    await writeFile(join(root, ".env"), "ELEVENLABS_API_KEY=project-value\n", "utf8");
    await writeFile(join(root, "local.env"), "ELEVENLABS_API_KEY=explicit-file-value\n", "utf8");
    const result = await loadProjectEnvironment({
      envFile: "local.env",
      processEnvironment: { ELEVENLABS_API_KEY: "host-value" },
      projectPath: root,
    });

    assert.equal(result.environment.ELEVENLABS_API_KEY, "host-value");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should prefer an explicit env file over the project dotenv", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-project-env-explicit-"));
  try {
    await writeFile(join(root, ".env"), "ELEVENLABS_API_KEY=project-value\n", "utf8");
    await writeFile(join(root, "local.env"), "ELEVENLABS_API_KEY=explicit-file-value\n", "utf8");
    const result = await loadProjectEnvironment({ envFile: "local.env", processEnvironment: {}, projectPath: root });

    assert.equal(result.environment.ELEVENLABS_API_KEY, "explicit-file-value");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject malformed and escaping relative env files without revealing values", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-project-env-invalid-"));
  try {
    await mkdir(join(root, "project"));
    await writeFile(join(root, "project", "bad.env"), "not an assignment sentinel-secret\n", "utf8");
    await assert.rejects(
      loadProjectEnvironment({ envFile: "bad.env", processEnvironment: {}, projectPath: join(root, "project") }),
      (error: unknown) => error instanceof ProjectEnvironmentError && error.code === "TN_PROJECT_ENV_FILE_INVALID" && !error.message.includes("sentinel-secret"),
    );
    await assert.rejects(
      loadProjectEnvironment({ envFile: "../outside.env", processEnvironment: {}, projectPath: join(root, "project") }),
      (error: unknown) => error instanceof ProjectEnvironmentError && error.code === "TN_PROJECT_ENV_FILE_OUTSIDE_PROJECT",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject a missing explicit env file with a stable diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-project-env-missing-"));
  try {
    await assert.rejects(
      loadProjectEnvironment({ envFile: "missing.env", processEnvironment: {}, projectPath: root }),
      (error: unknown) => error instanceof ProjectEnvironmentError && error.code === "TN_PROJECT_ENV_FILE_UNREADABLE",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
