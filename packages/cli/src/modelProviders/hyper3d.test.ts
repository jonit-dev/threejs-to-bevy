import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { hyper3dStatus, importHyper3dJob, pollHyper3dJob, submitHyper3dJob, type IHyper3dJobArtifact } from "./hyper3d.js";

test("should report provider readiness without leaking credential", async () => {
  const secret = "rodin-secret-token-that-must-not-leak";
  assert.deepEqual(await hyper3dStatus(false, {}), { liveRequested: false, provider: "hyper3d", state: "missing-credential" });
  const ready = await hyper3dStatus(false, { token: secret });
  assert.equal(ready.state, "available");
  assert.doesNotMatch(JSON.stringify(ready), new RegExp(secret));
  let requested = "";
  const live = await hyper3dStatus(true, { fetch: async (input) => { requested = String(input); return jsonResponse({ balance: 10 }); }, token: secret });
  assert.equal(live.state, "available");
  assert.match(requested, /\/check_balance$/);
});

test("should require exactly one text or local image input", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-input-"));
  let calls = 0;
  try {
    const dependencies = { fetch: async () => { calls += 1; return jsonResponse({}); }, token: "secret" };
    const acknowledged = { acceptCost: true, acceptTerms: true, confirmInputRights: true };
    await assert.rejects(submitHyper3dJob({ ...acknowledged, jobId: "job", projectPath: root }, dependencies), /exactly one/);
    await assert.rejects(submitHyper3dJob({ ...acknowledged, image: "https://example.com/input.png", jobId: "job", projectPath: root }, dependencies), /remote image URLs/);
    await assert.rejects(submitHyper3dJob({ ...acknowledged, image: "../input.png", jobId: "job", projectPath: root }, dependencies), /escapes/);
    await assert.rejects(submitHyper3dJob({ ...acknowledged, image: "input.png", jobId: "job", projectPath: root, prompt: "crate" }, dependencies), /exactly one/);
    assert.equal(calls, 0);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should require explicit external-provider acknowledgement", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-cost-")); let calls = 0;
  try {
    await assert.rejects(submitHyper3dJob({ acceptCost: false, acceptTerms: true, confirmInputRights: true, jobId: "job", projectPath: root, prompt: "blue crate" }, { fetch: async () => { calls += 1; return jsonResponse({}); }, token: "secret" }), /COST_ACK_REQUIRED/);
    await assert.rejects(submitHyper3dJob({ acceptCost: true, acceptTerms: false, confirmInputRights: true, jobId: "job", projectPath: root, prompt: "blue crate" }, { fetch: async () => { calls += 1; return jsonResponse({}); }, token: "secret" }), /TERMS_ACK_REQUIRED/);
    await assert.rejects(submitHyper3dJob({ acceptCost: true, acceptTerms: true, confirmInputRights: false, jobId: "job", projectPath: root, prompt: "blue crate" }, { fetch: async () => { calls += 1; return jsonResponse({}); }, token: "secret" }), /INPUT_RIGHTS_REQUIRED/);
    assert.equal(calls, 0);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should reserve durable job ID before a paid request", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-reserve-")); let calls = 0;
  try {
    await writeJob(root, "crate-job", {});
    await assert.rejects(submitHyper3dJob({ acceptCost: true, acceptTerms: true, confirmInputRights: true, jobId: "crate-job", projectPath: root, prompt: "blue crate" }, { fetch: async () => { calls += 1; return jsonResponse({}); }, token: "secret" }), /JOB_CONFLICT/);
    assert.equal(calls, 0);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should reject forged image bytes and symlink escapes before submission", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-image-")); const outside = await mkdtemp(join(tmpdir(), "tn-hyper3d-outside-")); let calls = 0;
  const options = { acceptCost: true, acceptTerms: true, confirmInputRights: true, jobId: "image-job", projectPath: root };
  try {
    await writeFile(join(root, "forged.png"), "not-a-png");
    await writeFile(join(outside, "real.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await symlink(join(outside, "real.png"), join(root, "escape.png"));
    const dependencies = { fetch: async () => { calls += 1; return jsonResponse({}); }, token: "secret" };
    await assert.rejects(submitHyper3dJob({ ...options, image: "forged.png" }, dependencies), /bytes do not match/);
    await assert.rejects(submitHyper3dJob({ ...options, image: "escape.png" }, dependencies), /symlink/);
    assert.equal(calls, 0);
  } finally { await rm(root, { force: true, recursive: true }); await rm(outside, { force: true, recursive: true }); }
});

test("should submit a valid project-local image as multipart and redact the recovery handle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-image-submit-")); let body: FormData | undefined;
  try {
    await writeFile(join(root, "reference.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]));
    const result = await submitHyper3dJob({ acceptCost: true, acceptTerms: true, confirmInputRights: true, image: "reference.png", jobId: "image-job", projectPath: root }, {
      fetch: async (_input, init) => { body = init?.body as FormData; return jsonResponse({ jobs: { subscription_key: "image-poll" }, uuid: "image-task" }); }, token: "secret",
    });
    assert.equal((body?.get("images") as Blob | null)?.type, "image/png");
    assert.equal(body?.get("prompt"), null);
    assert.equal(result.job.providerTaskId, "image-task");
    assert.equal("subscriptionKey" in result.job, false);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should retain a charged provider handle when final job promotion collides", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-recovery-"));
  try {
    const result = await submitHyper3dJob({ acceptCost: true, acceptTerms: true, confirmInputRights: true, jobId: "recovery-job", projectPath: root, prompt: "blue crate" }, {
      fetch: async () => {
        return jsonResponse({ jobs: { subscription_key: "recover-poll" }, uuid: "recover-task" });
      }, token: "secret",
    });
    assert.equal(result.job.providerTaskId, "recover-task");
    const job = await readFile(join(root, ".threenative/model-jobs/recovery-job.json"), "utf8");
    assert.match(job, /recover-task/);
    assert.doesNotMatch(job, /recover-poll/);
    await assert.rejects(submitHyper3dJob({ acceptCost: true, acceptTerms: true, confirmInputRights: true, jobId: "recovery-job", projectPath: root, prompt: "blue crate" }, { token: "secret" }), /JOB_CONFLICT|RECOVERY_REQUIRED/);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should atomically replace a concurrently substituted reservation symlink without leaking the provider handle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-reservation-race-")); const outside = await mkdtemp(join(tmpdir(), "tn-hyper3d-reservation-outside-"));
  const outsideFile = join(outside, "outside.txt");
  try {
    await writeFile(outsideFile, "unchanged", "utf8");
    const result = await submitHyper3dJob({ acceptCost: true, acceptTerms: true, confirmInputRights: true, jobId: "race-job", projectPath: root, prompt: "blue crate" }, {
      fetch: async () => {
        const reservation = join(root, ".threenative/model-jobs/race-job.json.reserve");
        await rm(reservation);
        await symlink(outsideFile, reservation);
        return jsonResponse({ jobs: { subscription_key: "race-secret" }, uuid: "race-task" });
      }, token: "secret",
    });
    assert.equal(result.job.providerTaskId, "race-task");
    assert.equal(await readFile(outsideFile, "utf8"), "unchanged");
    assert.doesNotMatch(await readFile(join(root, ".threenative/model-jobs/race-job.json"), "utf8"), /outside\.txt/);
  } finally { await rm(root, { force: true, recursive: true }); await rm(outside, { force: true, recursive: true }); }
});

test("should normalize queued running completed failed and expired states", async () => {
  const states: Array<[unknown[], string]> = [[["Waiting"], "queued"], [["Generating"], "running"], [["Done", "Done"], "completed"], [["Done", "Failed"], "failed"]];
  for (const [providerStates, expected] of states) {
    const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-state-"));
    try {
      await writeJob(root, "job", { currentState: "queued" });
      const result = await pollHyper3dJob({ jobId: "job", projectPath: root }, { fetch: async () => jsonResponse({ jobs: providerStates.map((status, index) => ({ status, uuid: `job-${index}` })) }), now: () => new Date("2026-07-14T00:00:00.000Z"), token: "secret" });
      assert.equal(result.job.currentState, expected);
    } finally { await rm(root, { force: true, recursive: true }); }
  }
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-expired-"));
  try {
    await writeJob(root, "job", { currentState: "queued", expiresAt: "2026-07-13T00:00:00.000Z" });
    const result = await pollHyper3dJob({ jobId: "job", projectPath: root }, { now: () => new Date("2026-07-14T00:00:00.000Z"), token: "secret" });
    assert.equal(result.job.currentState, "expired");
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should persist job metadata without key or signed URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-submit-"));
  const apiKey = "provider-api-key-must-stay-secret";
  const signedUrl = "https://cdn.example.test/model.glb?signature=must-not-persist";
  try {
    const result = await submitHyper3dJob({ acceptCost: true, acceptTerms: true, bbox: [100, 120, 80], confirmInputRights: true, jobId: "crate-job", projectPath: root, prompt: "a blue beveled crate" }, {
      fetch: async () => jsonResponse({ jobs: { subscription_key: "poll-handle" }, signedUrl, uuid: "task-uuid" }),
      now: () => new Date("2026-07-14T00:00:00.000Z"), token: apiKey,
    });
    const artifact = await readFile(join(root, ".threenative/model-jobs/crate-job.json"), "utf8");
    assert.doesNotMatch(JSON.stringify(result), /poll-handle|provider-api-key|signature/);
    assert.doesNotMatch(artifact, new RegExp(`${apiKey}|poll-handle|signature=`));
    assert.match(artifact, /"providerTaskId": "task-uuid"/);
    const secretArtifact = await readFile(join(root, ".threenative/model-jobs/crate-job.secret.json"), "utf8");
    assert.match(secretArtifact, /"subscriptionKey": "poll-handle"/);
    assert.doesNotMatch(secretArtifact, new RegExp(`${apiKey}|signature=`));
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should stage inspect and register completed GLB", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-import-"));
  try {
    await writeJob(root, "crate-job", { currentState: "completed" });
    const glb = minimalGlb();
    const result = await importHyper3dJob({ assetId: "crate.generated", jobId: "crate-job", projectPath: root, targetSize: 1 }, {
      fetch: async (input) => String(input).endsWith("/download")
        ? jsonResponse({ list: [{ name: "mesh.glb", url: "https://results.hyper3d.test/signed/model.glb?token=secret" }] })
        : new Response(glb, { headers: { "content-length": String(glb.length), "content-type": "model/gltf-binary" }, status: 200 }),
      allowedDownloadHosts: ["hyper3d.test"], now: () => new Date("2026-07-14T00:00:00.000Z"), token: "secret", uniqueId: () => "test-run",
    });
    const assetDocument = await readFile(join(root, "content/assets/crate.generated.assets.json"), "utf8");
    const provenance = await readFile(join(root, "assets/imported/hyper3d/crate.generated.provenance.json"), "utf8");
    assert.equal(result.code, "TN_MODEL_PROVIDER_IMPORT_OK");
    assert.match(assetDocument, /hyper3d:task-uuid/);
    assert.doesNotMatch(provenance, /signed|token=secret/);
    assert.equal((result.inspection as { bounds: { size: number[] } }).bounds.size[0], 1);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("should clean staged output and preserve source when registration fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-hyper3d-rollback-"));
  try {
    await writeJob(root, "crate-job", { currentState: "completed" });
    await mkdir(join(root, "content/assets"), { recursive: true });
    await writeFile(join(root, "content/assets/crate.generated.assets.json"), "{malformed-source\n", "utf8");
    const glb = minimalGlb();
    await assert.rejects(importHyper3dJob({ assetId: "crate.generated", jobId: "crate-job", projectPath: root }, {
      fetch: async (input) => String(input).endsWith("/download")
        ? jsonResponse({ list: [{ name: "mesh.glb", url: "https://results.hyper3d.test/model.glb" }] })
        : new Response(glb, { headers: { "content-length": String(glb.length) }, status: 200 }),
      allowedDownloadHosts: ["hyper3d.test"], token: "secret", uniqueId: () => "rollback-test",
    }), /registration|document|JSON|malformed/iu);
    assert.equal(await readFile(join(root, "content/assets/crate.generated.assets.json"), "utf8"), "{malformed-source\n");
    await assert.rejects(readFile(join(root, "assets/imported/hyper3d/crate.generated.glb")), /ENOENT/);
    await assert.rejects(readFile(join(root, "assets/imported/hyper3d/crate.generated.provenance.json")), /ENOENT/);
  } finally { await rm(root, { force: true, recursive: true }); }
});

async function writeJob(root: string, jobId: string, overrides: Partial<IHyper3dJobArtifact>): Promise<void> {
  await mkdir(join(root, ".threenative/model-jobs"), { recursive: true });
  const job: IHyper3dJobArtifact = {
    currentState: "queued", diagnostics: [], expiresAt: "2026-07-21T00:00:00.000Z", inputHash: `sha256:${"0".repeat(64)}`,
    jobId, provider: "hyper3d", providerTaskId: "task-uuid", schema: "threenative.model-provider-job", submittedAt: "2026-07-14T00:00:00.000Z",
    version: "0.1.0", ...overrides,
  };
  await writeFile(join(root, `.threenative/model-jobs/${jobId}.json`), `${JSON.stringify(job, null, 2)}\n`, "utf8");
  await writeFile(join(root, `.threenative/model-jobs/${jobId}.secret.json`), `${JSON.stringify({ jobId, provider: "hyper3d", providerTaskId: "task-uuid", schema: "threenative.model-provider-job-secret", subscriptionKey: "poll-handle", version: "0.1.0" }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function jsonResponse(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status: 200 }); }

function minimalGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" }, accessors: [{ componentType: 5126, count: 8, max: [2, 1, 1], min: [0, 0, 0], type: "VEC3" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }], nodes: [{ mesh: 0, name: "crate" }], scene: 0, scenes: [{ nodes: [0] }],
  }), "utf8");
  const paddedLength = (json.length + 3) & ~3; const padded = Buffer.alloc(paddedLength, 0x20); json.copy(padded);
  const output = Buffer.alloc(20 + paddedLength); output.write("glTF", 0, "ascii"); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8); output.writeUInt32LE(paddedLength, 12); output.writeUInt32LE(0x4e4f534a, 16); padded.copy(output, 20); return output;
}
