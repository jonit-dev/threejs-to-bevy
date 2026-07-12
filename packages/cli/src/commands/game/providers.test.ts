import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { gameProvidersCommand } from "./providers.js";

test("should report ElevenLabs available from project dotenv without leaking the key", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-providers-"));
  const secret = "elevenlabs-provider-sentinel";
  const previous = process.env.ELEVENLABS_API_KEY;
  try {
    delete process.env.ELEVENLABS_API_KEY;
    await writeFile(join(root, ".env"), `ELEVENLABS_API_KEY=${secret}\n`, "utf8");
    const result = await gameProvidersCommand(["--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { providers: Array<{ id: string; status: string }> };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.providers.find((provider) => provider.id === "elevenlabs")?.status, "available");
    assert.equal(result.stdout.includes(secret), false);
  } finally {
    if (previous === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previous;
    await rm(root, { force: true, recursive: true });
  }
});

test("should accept an explicit env file and return redacted file errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-game-providers-explicit-"));
  const previous = process.env.ELEVENLABS_API_KEY;
  try {
    delete process.env.ELEVENLABS_API_KEY;
    await writeFile(join(root, "providers.env"), "ELEVENLABS_API_KEY=explicit-sentinel\n", "utf8");
    const success = await gameProvidersCommand(["--project", root, "--env-file", "providers.env", "--json"]);
    assert.equal(success.exitCode, 0);
    assert.equal(success.stdout.includes("explicit-sentinel"), false);

    const failure = await gameProvidersCommand(["--project", root, "--env-file", "missing.env", "--json"]);
    assert.equal(failure.exitCode, 1);
    assert.equal((JSON.parse(failure.stdout) as { code: string }).code, "TN_PROJECT_ENV_FILE_UNREADABLE");
  } finally {
    if (previous === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previous;
    await rm(root, { force: true, recursive: true });
  }
});
