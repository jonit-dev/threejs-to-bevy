import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createSocket } from "node:dgram";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { publishAuthoringTransaction } from "@threenative/authoring";

import { inspectAsset } from "../commands/asset.js";
import { runImg2ThreejsGenerator } from "./runImg2ThreejsGenerator.js";

test("should export inspect promote and register a reviewed procedural Group", async () => {
  const root = await createRunnerProject(await readFixtureFactory());
  try {
    const result = await runImg2ThreejsGenerator(root, "prop.radio");
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal((await readFile(join(root, outputPath))).subarray(0, 4).toString("ascii"), "glTF");
    assert.equal(result.validation?.issues.numErrors, 0);
    assert.equal(result.inspection?.code, "TN_ASSET_INSPECT_OK");
    assert.equal(result.inspection?.file?.path, "assets/generated/prop.radio.glb");
    assert.ok(result.inspection?.namedNodes?.includes("prop.radio"));
    assert.ok(result.inspection?.namedNodes?.includes("socket.antenna"));
    assert.ok(result.inspection?.materials?.some((material) => material.name === "paint"));
    const asset = JSON.parse(await readFile(join(root, "content/assets/prop.radio.assets.json"), "utf8")) as { assets: Array<{ source: string }> };
    const provenance = JSON.parse(await readFile(join(root, provenancePath), "utf8")) as { outputHash: string };
    assert.equal(asset.assets[0]?.source, "generator:prop.radio");
    assert.equal(provenance.outputHash, result.outputHash);
    const first = await readFile(join(root, outputPath));
    const rerun = await runImg2ThreejsGenerator(root, "prop.radio");
    assert.equal(rerun.ok, true);
    assert.deepEqual(await readFile(join(root, outputPath)), first);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve the previous output when browser export fails", async () => {
  const root = await createRunnerProject(`import * as THREE from "three"; export function createPropRadioModel() { throw new Error("boom"); }`);
  try {
    await mkdir(join(root, "assets/generated"), { recursive: true });
    await writeFile(join(root, outputPath), "accepted-output");
    await mkdir(join(root, "content/assets"), { recursive: true });
    const acceptedRegistration = `${JSON.stringify({ assets: [{ id: "prop.radio", path: outputPath, source: "generator:prop.radio", type: "model" }], id: "prop.radio", schema: "threenative.assets", version: "0.1.0" }, null, 2)}\n`;
    await writeFile(join(root, "content/assets/prop.radio.assets.json"), acceptedRegistration);
    const before = await readFile(join(root, provenancePath));
    const result = await runImg2ThreejsGenerator(root, "prop.radio");
    assert.equal(result.ok, false);
    assert.equal((await readFile(join(root, outputPath), "utf8")), "accepted-output");
    assert.deepEqual(await readFile(join(root, provenancePath)), before);
    assert.equal(await readFile(join(root, "content/assets/prop.radio.assets.json"), "utf8"), acceptedRegistration);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject a factory returning a Scene Mesh or non-object value", async () => {
  for (const expression of ["new THREE.Scene()", "new THREE.Mesh()", "42", "null"] ) {
    const root = await createRunnerProject(`import * as THREE from "three"; export function createPropRadioModel() { return ${expression}; }`);
    try {
      const result = await runImg2ThreejsGenerator(root, "prop.radio");
      assert.equal(result.ok, false);
      assert.equal(result.code, "TN_IMG2THREEJS_FACTORY_EXPORT_INVALID");
      assert.match(result.message, /\/factory\/export/u);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test("should block network texture and fetch requests", async () => {
  const root = await createRunnerProject(`import * as THREE from "three"; export function createPropRadioModel() { fetch("http://127.0.0.1:9/blocked"); const root = new THREE.Group(); root.name = "prop.radio"; return root; }`);
  try {
    const result = await runImg2ThreejsGenerator(root, "prop.radio");
    assert.equal(result.ok, false);
    assert.equal(result.code, "TN_IMG2THREEJS_NETWORK_BLOCKED");
    await assert.rejects(readFile(join(root, outputPath)));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
  let connections = 0;
  const server = createServer((socket) => { connections += 1; socket.destroy(); });
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const socketRoot = await createRunnerProject(`import * as THREE from "three"; export function createPropRadioModel() { new WebSocket("ws://127.0.0.1:${address.port}/blocked"); const root = new THREE.Group(); root.name = "prop.radio"; return root; }`);
  try {
    const result = await runImg2ThreejsGenerator(socketRoot, "prop.radio");
    assert.equal(result.ok, false);
    assert.equal(result.code, "TN_IMG2THREEJS_NETWORK_BLOCKED");
    assert.equal(connections, 0);
    await assert.rejects(readFile(join(socketRoot, outputPath)));
  } finally {
    await rm(socketRoot, { force: true, recursive: true });
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
  let datagrams = 0;
  const udp = createSocket("udp4");
  udp.on("message", () => { datagrams += 1; });
  await new Promise<void>((resolve, reject) => udp.bind(0, "127.0.0.1", resolve).once("error", reject));
  const udpAddress = udp.address();
  const rtcRoot = await createRunnerProject(`import * as THREE from "three"; export function createPropRadioModel() { const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${udpAddress.port}" }] }); peer.createDataChannel("escape"); void peer.createOffer().then((offer) => peer.setLocalDescription(offer)); const root = new THREE.Group(); root.name = "prop.radio"; return root; }`);
  try {
    const result = await runImg2ThreejsGenerator(rtcRoot, "prop.radio");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(result.ok, false);
    assert.equal(result.code, "TN_IMG2THREEJS_NETWORK_BLOCKED");
    assert.equal(datagrams, 0);
    await assert.rejects(readFile(join(rtcRoot, outputPath)));
  } finally {
    await rm(rtcRoot, { force: true, recursive: true });
    udp.close();
  }
});

test("should terminate timed out or oversized generation", async () => {
  const root = await createRunnerProject(`import * as THREE from "three"; export function createPropRadioModel() { const root = new THREE.Group(); root.name = "prop.radio"; const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()); mesh.name = "body"; root.add(mesh); return root; }`, { maxOutputBytes: 32 });
  try {
    const result = await runImg2ThreejsGenerator(root, "prop.radio");
    assert.equal(result.ok, false);
    assert.equal(result.code, "TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED");
    assert.match(result.message, /limit is 32 bytes/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
  const timedOutRoot = await createRunnerProject(`import * as THREE from "three"; export function createPropRadioModel() { while (true) {} }`, { timeoutMs: 200 });
  try {
    const result = await runImg2ThreejsGenerator(timedOutRoot, "prop.radio");
    assert.equal(result.ok, false);
    assert.equal(result.code, "TN_IMG2THREEJS_EXPORT_TIMEOUT");
    await assert.rejects(readFile(join(timedOutRoot, outputPath)));
  } finally {
    await rm(timedOutRoot, { force: true, recursive: true });
  }
});

test("should preserve accepted fixture appearance after GLB reload", async () => {
  const root = await createRunnerProject(await readFixtureFactory());
  try {
    const result = await runImg2ThreejsGenerator(root, "prop.radio");
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.visualMetrics?.passed, true);
    assert.ok((result.visualMetrics?.silhouetteIou ?? 0) >= 0.995);
    assert.ok((result.visualMetrics?.ssim ?? 0) >= 0.98);
    assert.ok((result.visualMetrics?.meanNormalizedRgbDelta ?? 1) <= 3 / 255);
    assert.equal(result.proofFiles?.length, 4);
    for (const path of result.proofFiles ?? []) assert.ok((await readFile(join(root, path))).byteLength > 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should roll back when visual parity fails", async () => {
  const factory = `import * as THREE from "three"; export function createPropRadioModel() { const root = new THREE.Group(); root.name = "prop.radio"; const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "paint" })); mesh.name = "body"; root.add(mesh); return root; }`;
  const root = await createRunnerProject(factory);
  try {
    await mkdir(join(root, "assets/generated"), { recursive: true });
    await mkdir(join(root, "content/assets"), { recursive: true });
    await writeFile(join(root, outputPath), "accepted-output");
    const acceptedRegistration = `${JSON.stringify({ assets: [{ id: "prop.radio", path: outputPath, source: "generator:prop.radio", type: "model" }], id: "prop.radio", schema: "threenative.assets", version: "0.1.0" }, null, 2)}\n`;
    await writeFile(join(root, "content/assets/prop.radio.assets.json"), acceptedRegistration);
    const provenanceBefore = await readFile(join(root, provenancePath));
    const result = await runImg2ThreejsGenerator(root, "prop.radio", {
      measureVisualParity: (source) => ({
        diff: new Uint8Array(source.data.length),
        metrics: { meanNormalizedRgbDelta: 0.1, passed: false, silhouetteIou: 1, ssim: 1, thresholds: { meanNormalizedRgbDelta: 3 / 255, silhouetteIou: 0.995, ssim: 0.98 } },
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "TN_IMG2THREEJS_VISUAL_PARITY_FAILED");
    assert.equal(await readFile(join(root, outputPath), "utf8"), "accepted-output");
    assert.equal(await readFile(join(root, "content/assets/prop.radio.assets.json"), "utf8"), acceptedRegistration);
    assert.deepEqual(await readFile(join(root, provenancePath)), provenanceBefore);
    assert.equal(result.proofFiles?.length, 4);
    for (const path of result.proofFiles ?? []) assert.ok((await readFile(join(root, path))).byteLength > 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve manual skip and replace ownership semantics for img2threejs reruns", async () => {
  const factory = `import * as THREE from "three"; export function createPropRadioModel() { const root = new THREE.Group(); root.name = "prop.radio"; return root; }`;
  const root = await createRunnerProject(factory);
  let launches = 0;
  try {
    await mkdir(join(root, "assets/generated"), { recursive: true });
    await writeFile(join(root, outputPath), "manual-output");
    const provenance = JSON.parse(await readFile(join(root, provenancePath), "utf8")) as Record<string, unknown>;
    const runWithPolicy = async (overwritePolicy: "manual" | "replace" | "skip") => {
      provenance.overwritePolicy = overwritePolicy;
      await writeFile(join(root, provenancePath), `${JSON.stringify(provenance, null, 2)}\n`);
      return runImg2ThreejsGenerator(root, "prop.radio", { browser: { launch: async () => { launches += 1; throw new Error("browser unavailable for policy dispatch proof"); } } });
    };
    for (const policy of ["manual", "skip"] as const) {
      const result = await runWithPolicy(policy);
      assert.equal(result.code, "TN_GENERATOR_OUTPUT_CONFLICT");
      assert.equal(await readFile(join(root, outputPath), "utf8"), "manual-output");
    }
    assert.equal(launches, 0);

    provenance.outputHash = outputOwnershipHash(outputPath, Buffer.from("manual-output"));
    for (const policy of ["manual", "skip"] as const) {
      const result = await runWithPolicy(policy);
      assert.equal(result.code, "TN_IMG2THREEJS_BROWSER_UNAVAILABLE");
      assert.equal(await readFile(join(root, outputPath), "utf8"), "manual-output");
    }
    assert.equal(launches, 2);

    provenance.outputHash = `sha256:${"f".repeat(64)}`;
    for (const policy of ["manual", "skip"] as const) {
      const result = await runWithPolicy(policy);
      assert.equal(result.code, "TN_GENERATOR_OUTPUT_CONFLICT");
    }
    assert.equal(launches, 2);

    const replace = await runWithPolicy("replace");
    assert.equal(replace.code, "TN_IMG2THREEJS_BROWSER_UNAVAILABLE");
    assert.equal(launches, 3);
    assert.equal(await readFile(join(root, outputPath), "utf8"), "manual-output");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject concurrent output mutation during img2threejs publication", async () => {
  const factory = `import * as THREE from "three"; export function createPropRadioModel() { const root = new THREE.Group(); root.name = "prop.radio"; const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "paint" })); mesh.name = "body"; root.add(mesh); return root; }`;
  const root = await createRunnerProject(factory);
  try {
    await mkdir(join(root, "assets/generated"), { recursive: true });
    await writeFile(join(root, outputPath), "invocation-start-output");
    const concurrentProvenance = "concurrent-user-provenance";
    const concurrentRegistration = "concurrent-user-registration";
    const result = await runImg2ThreejsGenerator(root, "prop.radio", {
      publish: async (options) => {
        await writeFile(join(root, outputPath), "concurrent-user-output");
        await mkdir(join(root, "content/assets"), { recursive: true });
        await writeFile(join(root, "content/assets/prop.radio.assets.json"), concurrentRegistration);
        await writeFile(join(root, provenancePath), concurrentProvenance);
        return publishAuthoringTransaction(options);
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "TN_IMG2THREEJS_PROMOTION_FAILED");
    assert.equal(await readFile(join(root, outputPath), "utf8"), "concurrent-user-output");
    assert.equal(await readFile(join(root, provenancePath), "utf8"), concurrentProvenance);
    assert.equal(await readFile(join(root, "content/assets/prop.radio.assets.json"), "utf8"), concurrentRegistration);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createRunnerProject(factory: string, budgets: { maxOutputBytes?: number; timeoutMs?: number } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-img2threejs-runner-"));
  const files: Record<string, string> = {
    "content/generators/prop.radio.img2threejs.json": JSON.stringify({ export: { embedTextures: true, includeRuntimeExtras: true, rootNode: "prop.radio" }, validationReport: "content/generators/prop.radio.validation.json" }),
    "content/generators/prop.radio.sculpt-spec.json": "{}\n",
    "content/generators/prop.radio.validation.json": "{}\n",
    "content/references/prop.radio.png": "reference",
    "src/generators/createPropRadioModel.ts": factory,
    "artifacts/img2threejs/prop.radio/review.txt": "accepted",
  };
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), bytes);
  }
  const provenance = {
    acceptedPasses: [{ evidence: [{ path: "artifacts/img2threejs/prop.radio/review.txt", sha256: sha256(files["artifacts/img2threejs/prop.radio/review.txt"]!) }], id: "blockout", reviewHash: sha256("review") }],
    budgets: { maxMaterials: 8, maxOutputBytes: budgets.maxOutputBytes ?? 2_000_000, maxTextures: 1, maxTriangles: 20_000, timeoutMs: budgets.timeoutMs ?? 10_000 },
    export: "createPropRadioModel",
    id: "prop.radio",
    inputHash: sha256("inputs"),
    module: "src/generators/createPropRadioModel.ts",
    outputs: [outputPath],
    overwritePolicy: "replace",
    provider: "img2threejs",
    providerVersion: "1.2.0",
    recipe: "content/generators/prop.radio.img2threejs.json",
    schema: "threenative.generator-provenance",
    sculptSpec: "content/generators/prop.radio.sculpt-spec.json",
    sourceHashes: {
      factory: sha256(factory),
      recipe: sha256(files["content/generators/prop.radio.img2threejs.json"]!),
      resources: [],
      sculptSpec: sha256(files["content/generators/prop.radio.sculpt-spec.json"]!),
      sourceImage: sha256(files["content/references/prop.radio.png"]!),
      validationReport: sha256(files["content/generators/prop.radio.validation.json"]!),
    },
    sourceImage: "content/references/prop.radio.png",
    upstream: { commit: "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b", internalForkTree: "3f410de76c9a7ae53875abe7b47f99edf3beb2a6", repository: "https://github.com/hoainho/img2threejs", skillVersion: "1.2.0" },
    version: "0.1.0",
  };
  await writeFile(join(root, provenancePath), `${JSON.stringify(provenance, null, 2)}\n`);
  return root;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function outputOwnershipHash(path: string, bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(path).update("\0").update(bytes).update("\0").digest("hex")}`;
}

function readFixtureFactory(): Promise<string> {
  return readFile(join(dirname(fileURLToPath(import.meta.url)), "../../src/img2threejs/fixtures/createFixtureRadioModel.ts"), "utf8");
}

const outputPath = "assets/generated/prop.radio.glb";
const provenancePath = "content/generators/prop.radio.generator.json";
