import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { lookProfiles } from "../lookProfiles/registry.js";
import { authoringCommand } from "./authoring.js";
import { createProject } from "./create.js";
import { lookCommand } from "./look.js";

test("should list available look profiles", async () => {
  const result = await lookCommand(["list", "--json"]);
  const payload = JSON.parse(result.stdout) as {
    code: string;
    profiles: Array<{ id: string; summary: string }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_LOOK_LIST_OK");
  assert.deepEqual(payload.profiles.map((profile) => profile.id), lookProfiles.map((profile) => profile.id));
  assert.equal(payload.profiles.every((profile) => profile.summary.length > 0), true);
});

test("should apply each look profile with portable source mutations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-look-"));
  try {
    for (const profile of lookProfiles) {
      const create = await createProject([`game-${profile.id}`, "--json"], { cwd: root });
      const createPayload = JSON.parse(create.stdout) as { path: string };
      const result = await lookCommand(["apply", profile.id, "--project", createPayload.path, "--json"]);
      const payload = JSON.parse(result.stdout) as {
        code: string;
        diagnostics: unknown[];
        filesWritten: string[];
        profile: string;
        renderProfile: string;
      };

      assert.equal(result.exitCode, 0, result.stdout);
      assert.equal(payload.code, "TN_LOOK_APPLY_OK");
      assert.equal(payload.profile, profile.id);
      assert.equal(payload.renderProfile, "balanced");
      assert.equal(payload.diagnostics.length, 0);
      assert.equal(payload.filesWritten.includes("content/runtime/default.runtime.json"), true);
      assert.equal(payload.filesWritten.includes("content/materials/arena.materials.json"), true);

      const runtime = JSON.parse(await readFile(join(createPayload.path, "content", "runtime", "default.runtime.json"), "utf8")) as {
        renderer?: { antialias?: string; renderLook?: { overrides?: Record<string, unknown>; profile?: string; version?: number } };
      };
      assert.equal(runtime.renderer?.antialias, "msaa4");
      assert.deepEqual(runtime.renderer?.renderLook, {
        version: 1,
        profile: "balanced",
        overrides: {
          bloomIntensity: profile.renderLook.bloomIntensity,
          contrast: profile.renderLook.contrast,
          environmentIntensity: profile.renderLook.environmentIntensity,
          exposure: profile.renderLook.exposure,
          saturation: profile.renderLook.saturation,
          shadowQuality: profile.renderLook.shadowQuality,
        },
      });

      const materials = JSON.parse(await readFile(join(createPayload.path, "content", "materials", "arena.materials.json"), "utf8")) as {
        materials: Array<{ color?: string; emissive?: string; id: string; roughness?: number }>;
      };
      for (const material of profile.materials) {
        const actual = materials.materials.find((candidate) => candidate.id === material.id);
        assert.equal(actual?.color, material.color);
        assert.equal(actual?.roughness, material.roughness);
      }

      const validate = await authoringCommand(["validate", "--project", createPayload.path, "--json"]);
      const validationPayload = JSON.parse(validate.stdout) as { code: string; ok: boolean };
      assert.equal(validate.exitCode, 0, validate.stdout);
      assert.equal(validationPayload.code, "TN_AUTHORING_VALIDATE_OK");
      assert.equal(validationPayload.ok, true);
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should not duplicate profile data when applied twice", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-look-idempotent-"));
  try {
    const create = await createProject(["game", "--json"], { cwd: root });
    const createPayload = JSON.parse(create.stdout) as { path: string };
    const first = await lookCommand(["apply", "arcade-neon", "--project", createPayload.path, "--json"]);
    const runtimeAfterFirst = await readFile(join(createPayload.path, "content", "runtime", "default.runtime.json"), "utf8");
    const materialsAfterFirst = await readFile(join(createPayload.path, "content", "materials", "arena.materials.json"), "utf8");
    const second = await lookCommand(["apply", "arcade-neon", "--project", createPayload.path, "--json"]);
    const runtimeAfterSecond = await readFile(join(createPayload.path, "content", "runtime", "default.runtime.json"), "utf8");
    const materialsAfterSecond = await readFile(join(createPayload.path, "content", "materials", "arena.materials.json"), "utf8");

    assert.equal(first.exitCode, 0, first.stdout);
    assert.equal(second.exitCode, 0, second.stdout);
    assert.equal(runtimeAfterSecond, runtimeAfterFirst);
    assert.equal(materialsAfterSecond, materialsAfterFirst);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unknown look profiles", async () => {
  const result = await lookCommand(["apply", "sepia-space", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string; profile: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_LOOK_PROFILE_UNKNOWN");
  assert.equal(payload.profile, "sepia-space");
});
