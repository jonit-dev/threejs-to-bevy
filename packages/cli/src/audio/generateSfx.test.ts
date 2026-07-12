import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { audioCommand } from "../commands/sourceDocuments.js";
import { generateSfx } from "./generateSfx.js";
import { requestElevenLabsSfx } from "./elevenLabsSfx.js";

const mp3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
const secret = "sentinel-elevenlabs-secret";

function audioResponse(headers: Record<string, string> = {}): Response {
  return new Response(mp3, { headers: { "content-type": "audio/mpeg", ...headers }, status: 200 });
}

test("should generate register and bind an ElevenLabs sound effect", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sfx-success-"));
  try {
    await writeFile(join(root, ".env"), `ELEVENLABS_API_KEY=${secret}\n`);
    let requestBody: Record<string, unknown> | undefined;
    const result = await audioCommand(
      ["generate-sfx", "impact", "--prompt", "Heavy impact", "--duration", "1.5", "--loop", "--prompt-influence", "0.7", "--audio-doc", "arena", "--sound-id", "hit", "--project", root, "--json"],
      { fetch: async (_input: string | URL | Request, init?: RequestInit) => { assert.equal(new Headers(init?.headers).get("xi-api-key"), secret); requestBody = JSON.parse(String(init?.body)); return audioResponse({ "request-id": "req-1", "character-cost": "12" }); } } as never,
    );
    assert.equal(result.exitCode, 0, result.stdout);
    assert.deepEqual(requestBody, { duration_seconds: 1.5, loop: true, model_id: "eleven_text_to_sound_v2", prompt_influence: 0.7, text: "Heavy impact" });
    assert.deepEqual(new Uint8Array(await readFile(join(root, "assets/generated/audio/impact.mp3"))), mp3);
    const asset = JSON.parse(await readFile(join(root, "content/assets/impact.assets.json"), "utf8"));
    const audio = JSON.parse(await readFile(join(root, "content/audio/arena.audio.json"), "utf8"));
    assert.equal(asset.assets[0].path, "assets/generated/audio/impact.mp3");
    assert.deepEqual(audio.sounds, [{ asset: "impact", id: "hit" }]);
    const provenance = JSON.parse(await readFile(join(root, "content/assets/impact.sfx-generation.json"), "utf8"));
    assert.equal(provenance.generation.provider, "elevenlabs");
    assert.equal(provenance.generation.prompt, "Heavy impact");
    assert.equal(provenance.generation.requestId, "req-1");
    assert.doesNotMatch(JSON.stringify(provenance), new RegExp(secret, "u"));
    assert.doesNotMatch(result.stdout, new RegExp(secret, "u"));
    assert.match(result.stdout, /req-1/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should fail before network access when credential or arguments are invalid", async () => {
  let calls = 0;
  const fetch = async (): Promise<Response> => { calls += 1; return audioResponse(); };
  const missing = await generateSfx({ assetId: "impact", fetch, json: true, projectPath: ".", prompt: "impact" });
  const invalid = await generateSfx({ apiKey: secret, assetId: "../impact", fetch, json: true, projectPath: ".", prompt: "impact" });
  assert.equal(calls, 0);
  assert.match(missing.stdout, /TN_AUDIO_SFX_CREDENTIAL_MISSING/u);
  assert.match(invalid.stdout, /TN_AUDIO_SFX_ASSET_ID_INVALID/u);
});

test("should not retry an ambiguous billable request", async () => {
  let calls = 0;
  const result = await generateSfx({ apiKey: secret, assetId: "impact", fetch: async () => { calls += 1; throw new TypeError("connection reset"); }, json: true, projectPath: ".", prompt: "impact" });
  assert.equal(calls, 1);
  assert.match(result.stdout, /billingMayBeUnknown/u);
  assert.match(result.stdout, /not retried/u);
});

test("should leave source unchanged when provider validation or registration fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sfx-rollback-"));
  try {
    await mkdir(join(root, "content/assets"), { recursive: true });
    const original = "{ malformed user source";
    await writeFile(join(root, "content/assets/impact.assets.json"), original);
    let calls = 0;
    const result = await generateSfx({ apiKey: secret, assetId: "impact", fetch: async () => { calls += 1; return audioResponse(); }, json: true, projectPath: root, prompt: "impact" });
    assert.match(result.stdout, /TN_AUDIO_SFX_ASSET_SOURCE_INVALID/u);
    assert.equal(calls, 0);
    assert.equal(await readFile(join(root, "content/assets/impact.assets.json"), "utf8"), original);
    await assert.rejects(readFile(join(root, "assets/generated/audio/impact.mp3")));

    const invalid = await generateSfx({ apiKey: secret, assetId: "other", fetch: async () => new Response("not audio", { headers: { "content-type": "text/plain" } }), json: true, projectPath: root, prompt: "impact" });
    assert.match(invalid.stdout, /TN_AUDIO_SFX_RESPONSE_CONTENT_TYPE_INVALID/u);
    await assert.rejects(readFile(join(root, "assets/generated/audio/other.mp3")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects malformed MP3 bytes without writing source or assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sfx-malformed-mp3-"));
  try {
    const result = await generateSfx({ apiKey: secret, assetId: "impact", fetch: async () => new Response(Uint8Array.from([1, 2, 3, 4]), { headers: { "content-type": "audio/mpeg" } }), json: true, projectPath: root, prompt: "impact" });
    assert.match(result.stdout, /TN_AUDIO_SFX_RESPONSE_INVALID/u);
    await assert.rejects(readFile(join(root, "assets/generated/audio/impact.mp3")));
    await assert.rejects(readFile(join(root, "content/assets/impact.assets.json")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("force replacement restores prior audio asset source and provenance when registration fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sfx-force-rollback-"));
  try {
    await mkdir(join(root, "assets/generated/audio"), { recursive: true });
    await mkdir(join(root, "content/assets"), { recursive: true });
    await mkdir(join(root, "content/audio"), { recursive: true });
    const oldMp3 = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0]);
    const oldAsset = `${JSON.stringify({ schema: "threenative/assets", version: "0.1.0", id: "impact", assets: [{ id: "impact", type: "audio", path: "assets/old.mp3" }] }, null, 2)}\n`;
    const oldProvenance = "{\"previous\":true}\n";
    await writeFile(join(root, "assets/generated/audio/impact.mp3"), oldMp3);
    await writeFile(join(root, "content/assets/impact.assets.json"), oldAsset);
    await writeFile(join(root, "content/assets/impact.sfx-generation.json"), oldProvenance);
    await writeFile(join(root, "content/audio/arena.audio.json"), `${JSON.stringify({ schema: "wrong/schema", version: "0.1.0", id: "arena", sounds: [] })}\n`);
    const result = await generateSfx({ apiKey: secret, assetId: "impact", audioDocId: "arena", fetch: async () => audioResponse(), force: true, json: true, projectPath: root, prompt: "impact", soundId: "hit" });
    assert.match(result.stdout, /TN_AUDIO_SFX_REGISTRATION_FAILED/u);
    assert.deepEqual(new Uint8Array(await readFile(join(root, "assets/generated/audio/impact.mp3"))), oldMp3);
    assert.equal(await readFile(join(root, "content/assets/impact.assets.json"), "utf8"), oldAsset);
    assert.equal(await readFile(join(root, "content/assets/impact.sfx-generation.json"), "utf8"), oldProvenance);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("should redact provider error payloads and credentials", async () => {
  const response = await generateSfx({
    apiKey: secret,
    assetId: "impact",
    fetch: async () => new Response(`authorization: ${secret} xi-api-key=${secret}`, { status: 401 }),
    json: true,
    projectPath: ".",
    prompt: "impact",
  });
  assert.match(response.stdout, /TN_AUDIO_SFX_PROVIDER_AUTH/u);
  assert.doesNotMatch(response.stdout, new RegExp(secret, "u"));
});

test("maps provider output format and does not expose the key in the URL or body", async () => {
  await requestElevenLabsSfx({ apiKey: secret, outputFormat: "mp3_44100_192", prompt: "click", fetch: async (input, init) => {
    assert.match(String(input), /output_format=mp3_44100_192/u);
    assert.doesNotMatch(String(input), new RegExp(secret, "u"));
    assert.doesNotMatch(String(init?.body), new RegExp(secret, "u"));
    return audioResponse();
  } });
});

test("rejects destination conflicts before making a paid request", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-sfx-conflict-"));
  try {
    await mkdir(join(root, "assets/generated/audio"), { recursive: true });
    await writeFile(join(root, "assets/generated/audio/impact.mp3"), mp3);
    let calls = 0;
    const result = await generateSfx({ apiKey: secret, assetId: "impact", fetch: async () => { calls += 1; return audioResponse(); }, json: true, projectPath: root, prompt: "impact" });
    assert.equal(calls, 0);
    assert.match(result.stdout, /TN_AUDIO_SFX_DESTINATION_CONFLICT/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("normalizes provider timeouts without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    requestElevenLabsSfx({ apiKey: secret, prompt: "click", timeoutMs: 1, fetch: async (_input, init) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    } }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "TN_AUDIO_SFX_PROVIDER_TIMEOUT",
  );
  assert.equal(calls, 1);
});
