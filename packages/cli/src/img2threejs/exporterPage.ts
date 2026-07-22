import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { renderImg2ThreejsCompatibilityModule } from "./compatibility.js";
import type { IImg2ThreejsPixelFrame } from "./visualParity.js";

const virtualOrigin = "https://img2threejs.invalid";
const maxBrowserLogBytes = 128 * 1024;

export interface IImg2ThreejsBrowserResource {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  path: string;
}

export interface IImg2ThreejsBrowserExportOptions {
  exportName: string;
  includeRuntimeExtras: boolean;
  maxOutputBytes: number;
  moduleJavaScript: string;
  outputPath: string;
  resources: IImg2ThreejsBrowserResource[];
  rootName: string;
  timeoutMs: number;
}

export interface IImg2ThreejsBrowserExportResult {
  byteSize: number;
  logs: string[];
  nodes: number;
  reload: { names: string[]; runtime?: unknown };
  reloaded: IImg2ThreejsPixelFrame;
  source: IImg2ThreejsPixelFrame;
}

export interface IImg2ThreejsBrowserDependencies {
  launch(): Promise<Browser>;
}

export async function exportImg2ThreejsPage(
  options: IImg2ThreejsBrowserExportOptions,
  dependencies: IImg2ThreejsBrowserDependencies = { launch: () => chromium.launch({ args: ["--disable-quic", "--host-resolver-rules=MAP * ~NOTFOUND"], headless: true }) },
): Promise<IImg2ThreejsBrowserExportResult> {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const logs: string[] = [];
  let logBytes = 0;
  let blockedUrl: string | undefined;
  const blobFetchToken = randomUUID();
  const appendLog = (message: string): void => {
    const remaining = maxBrowserLogBytes - logBytes;
    if (remaining <= 0) return;
    const bounded = Buffer.from(message).subarray(0, remaining).toString("utf8");
    logs.push(bounded);
    logBytes += Buffer.byteLength(bounded);
  };

  try {
    browser = await dependencies.launch();
    context = await browser.newContext({ acceptDownloads: true, deviceScaleFactor: 1, serviceWorkers: "block", viewport: { height: 512, width: 512 } });
    await context.addInitScript({ content: createNetworkLockdownScript(blobFetchToken) });
    await context.routeWebSocket(/.*/u, (webSocket) => {
      blockedUrl ??= webSocket.url();
      webSocket.close({ code: 1008, reason: "Network access is blocked during img2threejs export." });
    });
    page = await context.newPage();
    page.on("console", (message) => appendLog(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => appendLog(`pageerror: ${error.message}`));

    const require = createRequire(import.meta.url);
    const threePath = join(dirname(require.resolve("three")), "three.module.js");
    const threeCorePath = join(dirname(threePath), "three.core.js");
    const endpoints = new Map<string, { body: Buffer | string | Uint8Array; contentType: string }>([
      ["/", { body: pageHtml, contentType: "text/html" }],
      ["/index.html", { body: pageHtml, contentType: "text/html" }],
      ["/factory.js", { body: options.moduleJavaScript, contentType: "text/javascript" }],
      ["/run.js", { body: createRunModule(options), contentType: "text/javascript" }],
      ["/compatibility.js", { body: renderImg2ThreejsCompatibilityModule(), contentType: "text/javascript" }],
      ["/three.module.js", { body: await readFile(threePath), contentType: "text/javascript" }],
      ["/three.core.js", { body: await readFile(threeCorePath), contentType: "text/javascript" }],
      ["/GLTFExporter.js", { body: await readFile(require.resolve("three/addons/exporters/GLTFExporter.js")), contentType: "text/javascript" }],
      ["/GLTFLoader.js", { body: await readFile(require.resolve("three/addons/loaders/GLTFLoader.js")), contentType: "text/javascript" }],
      ["/utils/BufferGeometryUtils.js", { body: await readFile(require.resolve("three/addons/utils/BufferGeometryUtils.js")), contentType: "text/javascript" }],
    ]);
    for (const resource of options.resources) endpoints.set(`/${resource.path}`, { body: resource.bytes, contentType: resource.mimeType });
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      const url = new URL(requestUrl);
      const endpoint = url.origin === virtualOrigin && url.search === "" && url.hash === "" ? endpoints.get(url.pathname) : undefined;
      if (endpoint === undefined) {
        blockedUrl ??= requestUrl;
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({ body: typeof endpoint.body === "string" || Buffer.isBuffer(endpoint.body) ? endpoint.body : Buffer.from(endpoint.body), contentType: endpoint.contentType, status: 200 });
    });

    const operation = async (): Promise<IImg2ThreejsBrowserExportResult> => {
      await page!.goto(`${virtualOrigin}/index.html`, { waitUntil: "load" });
      await page!.waitForFunction(() => (globalThis as unknown as { __img2threejs?: { state?: string } }).__img2threejs?.state !== "loading");
      const initial = await page!.evaluate(() => (globalThis as unknown as { __img2threejs?: { error?: string; nodes?: number; state?: string } }).__img2threejs);
      if (blockedUrl !== undefined) throw diagnosticError("TN_IMG2THREEJS_NETWORK_BLOCKED", `Factory attempted a blocked network request: ${blockedUrl}`);
      if (initial?.state !== "ready") throw browserDiagnostic(initial?.error ?? "Factory export did not initialize.");
      await page!.evaluate((token) => (globalThis as unknown as { postMessage(message: unknown): void }).postMessage({ token, type: "threenative-enable-blob-fetch" }), blobFetchToken);
      const downloadPromise = page!.waitForEvent("download");
      let proof: { reload: { names: string[]; runtime?: unknown }; reloaded: { data: number[]; height: number; width: number }; source: { data: number[]; height: number; width: number } };
      try {
        proof = await page!.evaluate(() => (globalThis as unknown as { __img2threejsExport(): Promise<typeof proof> }).__img2threejsExport());
      } catch (error) {
        void downloadPromise.catch(() => undefined);
        throw browserDiagnostic(error instanceof Error ? error.message : String(error));
      }
      const download = await downloadPromise;
      await download.saveAs(options.outputPath);
      if (blockedUrl !== undefined) throw diagnosticError("TN_IMG2THREEJS_NETWORK_BLOCKED", `Factory attempted a blocked network request: ${blockedUrl}`);
      const byteSize = (await stat(options.outputPath)).size;
      if (byteSize > options.maxOutputBytes) throw diagnosticError("TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED", `Generated GLB is ${byteSize} bytes; limit is ${options.maxOutputBytes} bytes.`);
      return {
        byteSize,
        logs,
        nodes: initial.nodes ?? 0,
        reload: proof.reload,
        reloaded: { ...proof.reloaded, data: Uint8Array.from(proof.reloaded.data) },
        source: { ...proof.source, data: Uint8Array.from(proof.source.data) },
      };
    };
    return await withTimeout(operation(), options.timeoutMs);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw diagnosticError("TN_IMG2THREEJS_EXPORT_TIMEOUT", `Browser generation exceeded ${options.timeoutMs}ms.`);
    if (browser === undefined && error instanceof Error && /browser|chromium|executable/iu.test(error.message)) throw diagnosticError("TN_IMG2THREEJS_BROWSER_UNAVAILABLE", `The isolated Chromium exporter is unavailable: ${error.message}`);
    throw error;
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

function createRunModule(options: IImg2ThreejsBrowserExportOptions): string {
  return `
import * as THREE from "three";
import { compatibility } from "/compatibility.js";
import { GLTFExporter } from "/GLTFExporter.js";
import { GLTFLoader } from "/GLTFLoader.js";
const state = globalThis.__img2threejs = { state: "loading" };
const fail = (code, path, message) => { throw new Error(code + ": " + path + ": " + message); };
try {
  const factoryModule = await import("/factory.js");
  const factory = factoryModule[${JSON.stringify(options.exportName)}];
  if (typeof factory !== "function") fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", "/factory/export", "declared named export is not a function");
  const root = await factory({ deterministic: true });
  if (!root || root.isGroup !== true || root.isScene === true || root.isMesh === true) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", "/factory/export", "factory must return a THREE.Group");
  if (root.name !== ${JSON.stringify(options.rootName)}) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", "/factory/export", "root Group name must match export.rootNode");
  const names = new Set();
  const byUuid = new Map();
  let nodes = 0;
  const materials = new Set();
  root.traverse((node) => {
    const path = "/nodes/" + nodes;
    nodes += 1;
    if (nodes > 2048) fail("TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED", path, "hierarchy exceeds 2048 nodes");
    if (!node.name || names.has(node.name)) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", path + "/name", "every node must have a unique stable name");
    names.add(node.name); byUuid.set(node.uuid, node.name);
    if (![...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()].every(Number.isFinite) || node.scale.toArray().some((value) => value === 0)) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", path + "/transform", "transforms must be finite and scale non-zero");
    if (!compatibility.objectTypes.includes(node.type) || node.isScene || node.isCamera || node.isLight || node.isHelper || node.isSkinnedMesh || node.isInstancedMesh || node.isLine || node.isPoints || node.isSprite || node.isLOD || node.isBone) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path, "unsupported or review-only object type " + node.type);
    if (node.morphTargetInfluences || (node.animations && node.animations.length)) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path, "morph targets and animations are unsupported in v1");
    if (!node.isMesh) return;
    const geometry = node.geometry;
    if (!geometry?.isBufferGeometry || Object.keys(geometry.morphAttributes ?? {}).length) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/geometry", "only non-morph BufferGeometry is supported");
    const position = geometry.getAttribute("position");
    if (!position || position.itemSize !== 3 || position.count === 0) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/geometry/attributes/position", "finite POSITION itemSize 3 is required");
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const sizes = compatibility.geometryAttributes[name];
      if (!sizes || !sizes.includes(attribute.itemSize) || attribute.count !== position.count) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/geometry/attributes/" + name, "attribute is outside the v1 matrix");
      for (let index = 0; index < attribute.array.length; index += 1) if (!Number.isFinite(attribute.array[index])) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", path + "/geometry/attributes/" + name, "attribute values must be finite");
    }
    if (geometry.index) for (let index = 0; index < geometry.index.count; index += 1) { const value = geometry.index.getX(index); if (!Number.isInteger(value) || value < 0 || value >= position.count) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", path + "/geometry/index", "index is outside POSITION range"); }
    const meshMaterials = Array.isArray(node.material) ? node.material : [node.material];
    const elementCount = geometry.index?.count ?? position.count;
    if (elementCount % 3 !== 0) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/geometry", "triangle geometry element count must be divisible by three");
    if (Array.isArray(node.material) && geometry.groups.length === 0) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", path + "/geometry/groups", "multi-material geometry requires resolvable groups");
    for (const [groupIndex, group] of geometry.groups.entries()) {
      if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 || group.count <= 0 || group.start + group.count > elementCount || group.start % 3 !== 0 || group.count % 3 !== 0) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", path + "/geometry/groups/" + groupIndex, "group start/count must describe in-range triangles");
      if (Array.isArray(node.material) && (!Number.isInteger(group.materialIndex) || group.materialIndex < 0 || group.materialIndex >= meshMaterials.length)) fail("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", path + "/geometry/groups/" + groupIndex + "/materialIndex", "group material index is unresolved");
    }
    for (const material of meshMaterials) materials.add(material);
  });
  const texturePromises = [];
  for (const material of materials) {
    const path = "/materials/" + (material.name || material.uuid);
    if (!compatibility.materialTypes.includes(material.type) || material.isShaderMaterial || material.isRawShaderMaterial || material.isMeshPhysicalMaterial) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path, "material type " + material.type + " is unsupported");
    if (material.displacementMap || material.bumpMap || material.alphaMap || material.lightMap || material.envMap || material.wireframe || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path, "material uses an unsupported v1 field or custom shader hook");
    if (material.blending !== THREE.NormalBlending || material.depthTest !== true || material.depthWrite !== true || material.stencilWrite === true) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path, "custom blend/depth/stencil state is unsupported");
    const used = new Set();
    for (const [slot, requiredColorSpace] of Object.entries(compatibility.textureSlots)) {
      const texture = material[slot]; if (!texture) continue; used.add(slot);
      if (!texture.isTexture || texture.isCubeTexture || texture.isDataTexture || texture.isCompressedTexture || texture.isDepthTexture || texture.isVideoTexture || texture.isRenderTargetTexture) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/" + slot, "texture kind is unsupported");
      if (texture.colorSpace !== THREE[requiredColorSpace]) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/" + slot + "/colorSpace", "texture color space does not match its channel role");
      if (texture.channel < 0 || texture.channel > 3 || !material.map && !material.emissiveMap && !material.normalMap && !material.aoMap && !material.metalnessMap && !material.roughnessMap) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/" + slot, "texture channel is outside the v1 matrix");
      if (texture.center.x !== 0 || texture.center.y !== 0 || texture.matrixAutoUpdate !== true) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/" + slot + "/transform", "texture center and manual matrices are unsupported");
      const image = texture.image;
      if (image instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas)) {
        if (image.width < 1 || image.height < 1 || image.width > compatibility.maxTextureDimension || image.height > compatibility.maxTextureDimension) fail("TN_IMG2THREEJS_TEXTURE_LOAD_FAILED", path + "/" + slot, "canvas dimensions are invalid");
        try { image.getContext("2d").getImageData(0, 0, 1, 1); } catch { fail("TN_IMG2THREEJS_TEXTURE_LOAD_FAILED", path + "/" + slot, "canvas is tainted"); }
      } else if (image instanceof HTMLImageElement) {
        texturePromises.push((async () => { if (!image.complete) await new Promise((resolve, reject) => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", reject, { once: true }); }); await image.decode(); if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > compatibility.maxTextureDimension || image.naturalHeight > compatibility.maxTextureDimension) fail("TN_IMG2THREEJS_TEXTURE_LOAD_FAILED", path + "/" + slot, "image dimensions are invalid"); })());
      } else fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/" + slot, "texture must be backed by a local image or canvas");
    }
    for (const key of Object.keys(material)) if (material[key]?.isTexture && !used.has(key)) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path + "/" + key, "texture slot is unsupported");
    if (material.metalnessMap && material.roughnessMap) { const a = material.metalnessMap, b = material.roughnessMap; if (a.image !== b.image || a.channel !== b.channel || !a.offset.equals(b.offset) || !a.repeat.equals(b.repeat) || a.rotation !== b.rotation) fail("TN_IMG2THREEJS_FEATURE_UNSUPPORTED", path, "metalness and roughness maps must share source and transform"); }
  }
  await Promise.all(texturePromises);
  const clean = root.clone(true);
  const sourceNodes = []; const cleanNodes = []; root.traverse((node) => sourceNodes.push(node)); clean.traverse((node) => cleanNodes.push(node));
  for (let index = 0; index < cleanNodes.length; index += 1) { const sourceNode = sourceNodes[index], cleanNode = cleanNodes[index]; cleanNode.userData = {}; if (cleanNode.isMesh) { cleanNode.geometry = sourceNode.geometry.clone(); cleanNode.geometry.userData = {}; cleanNode.material = (Array.isArray(sourceNode.material) ? sourceNode.material : [sourceNode.material]).map((material) => { const clone = material.clone(); clone.userData = {}; return clone; }); if (!Array.isArray(sourceNode.material)) cleanNode.material = cleanNode.material[0]; } }
  if (${options.includeRuntimeExtras ? "true" : "false"} && root.userData?.sculptRuntime !== undefined) clean.userData.threenative = sanitizeRuntime(root.userData.sculptRuntime, byUuid);
  state.root = root; state.clean = clean; state.nodes = nodes; state.state = "ready";
  globalThis.__img2threejsExport = async () => {
    const proofSetup = createProofSetup(root);
    const source = render(root, proofSetup);
    const result = await new GLTFExporter().parseAsync(clean, { binary: true, includeCustomExtensions: false, onlyVisible: false });
    if (!(result instanceof ArrayBuffer)) fail("TN_IMG2THREEJS_GLTF_INVALID", "/output", "GLTFExporter did not return a binary GLB");
    if (result.byteLength > ${options.maxOutputBytes}) fail("TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED", "/output", "generated " + result.byteLength + " bytes; limit is ${options.maxOutputBytes} bytes");
    const loaded = await new GLTFLoader().parseAsync(result.slice(0), "");
    const reloaded = render(loaded.scene, proofSetup);
    const reloadNames = []; let reloadedRoot; loaded.scene.traverse((node) => { const authoredName = node.userData?.name ?? node.name; if (authoredName) reloadNames.push(authoredName); if (authoredName === ${JSON.stringify(options.rootName)}) reloadedRoot = node; });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([result], { type: "model/gltf-binary" })); anchor.download = "output.glb"; anchor.click();
    return { source, reloaded, reload: { names: reloadNames.sort(), runtime: reloadedRoot?.userData?.threenative } };
  };
} catch (error) { state.error = error instanceof Error ? error.message : String(error); state.state = "failed"; }

function sanitizeRuntime(value, byUuid) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", "/userData/sculptRuntime", "metadata must be an object");
  const allowed = new Set(["sourceId", "sockets", "colliders", "destructionGroups"]); for (const key of Object.keys(value)) if (!allowed.has(key)) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", "/userData/sculptRuntime/" + key, "unknown runtime metadata key");
  const id = (item, path) => { if (typeof item !== "string" || !/^[A-Za-z0-9._-]+$/.test(item)) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path, "logical ID is invalid"); return item; };
  const nodeName = (node, path) => { const name = node?.isObject3D ? byUuid.get(node.uuid) : undefined; if (!name) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path, "runtime reference must target an internal named node"); return name; };
  const output = { schema: "threenative.img2threejs-runtime", version: "0.1.0", provider: "img2threejs" };
  if (value.sourceId !== undefined) output.sourceId = id(value.sourceId, "/userData/sculptRuntime/sourceId");
  const plainRecord = (item, path) => { if (!item || Object.getPrototypeOf(item) !== Object.prototype) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path, "value must be a plain object"); return item; };
  output.sockets = Object.entries(plainRecord(value.sockets ?? {}, "/userData/sculptRuntime/sockets")).map(([key, node]) => ({ id: id(key, "/userData/sculptRuntime/sockets"), node: nodeName(node, "/userData/sculptRuntime/sockets/" + key) })).sort((a, b) => a.id.localeCompare(b.id));
  if (!Array.isArray(value.colliders ?? [])) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", "/userData/sculptRuntime/colliders", "colliders must be an array");
  output.colliders = (value.colliders ?? []).map((collider, index) => { const path = "/userData/sculptRuntime/colliders/" + index; if (!collider || Object.getPrototypeOf(collider) !== Object.prototype) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path, "collider must be an object"); const keys = new Set(["id","node","kind","size","radius","height","isTrigger"]); for (const key of Object.keys(collider)) if (!keys.has(key)) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path + "/" + key, "unknown collider key"); if (!["box","sphere","capsule"].includes(collider.kind)) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path + "/kind", "collider kind is invalid"); const result = { id: id(collider.id, path + "/id"), node: nodeName(collider.node, path + "/node"), kind: collider.kind }; for (const key of ["radius","height"]) if (collider[key] !== undefined) { if (!Number.isFinite(collider[key]) || collider[key] <= 0) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path + "/" + key, "collider value must be finite and positive"); result[key] = collider[key]; } if (collider.size !== undefined) { if (!Array.isArray(collider.size) || collider.size.length !== 3 || !collider.size.every((item) => Number.isFinite(item) && item > 0)) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path + "/size", "collider size must contain three positive finite values"); result.size = [...collider.size]; } if (collider.isTrigger !== undefined) { if (typeof collider.isTrigger !== "boolean") fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", path + "/isTrigger", "isTrigger must be a boolean"); result.isTrigger = collider.isTrigger; } return result; }).sort((a, b) => a.id.localeCompare(b.id));
  output.destructionGroups = Object.entries(plainRecord(value.destructionGroups ?? {}, "/userData/sculptRuntime/destructionGroups")).map(([key, nodeList]) => { if (!Array.isArray(nodeList)) fail("TN_IMG2THREEJS_RUNTIME_METADATA_INVALID", "/userData/sculptRuntime/destructionGroups/" + key, "destruction group must be an array"); return { id: id(key, "/userData/sculptRuntime/destructionGroups"), nodes: nodeList.map((node, index) => nodeName(node, "/userData/sculptRuntime/destructionGroups/" + key + "/" + index)).sort() }; }).sort((a, b) => a.id.localeCompare(b.id));
  return output;
}

function createProofSetup(root) {
  const box = new THREE.Box3().setFromObject(root); const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const radius = Math.max(size.x, size.y, size.z, 0.1);
  return { center: center.toArray(), position: center.clone().add(new THREE.Vector3(radius * 2.6, radius * 1.8, radius * 3.4)).toArray() };
}
function render(root, proofSetup) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); renderer.setSize(512, 512, false); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1; renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(); scene.add(root); scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2)); const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(3, 4, 5); scene.add(key);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000); camera.position.fromArray(proofSetup.position); camera.lookAt(new THREE.Vector3().fromArray(proofSetup.center)); camera.updateProjectionMatrix(); renderer.render(scene, camera);
  const context = renderer.getContext(); const data = new Uint8Array(512 * 512 * 4); context.readPixels(0, 0, 512, 512, context.RGBA, context.UNSIGNED_BYTE, data); scene.remove(root); renderer.dispose(); return { data: Array.from(data), height: 512, width: 512 };
}
`;
}

function browserDiagnostic(message: string): Error & { code: string } {
  const match = /\b(TN_IMG2THREEJS_[A-Z_]+):\s*(.*)/su.exec(message);
  if (match) return diagnosticError(match[1]!, match[2]!);
  return diagnosticError("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

export function diagnosticError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three.module.js"}}</script></head><body><script type="module" src="/run.js"></script></body></html>`;

function createNetworkLockdownScript(blobFetchToken: string): string {
  return `
(() => {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let allowBlobFetch = false;
  function reject() { throw new Error("TN_IMG2THREEJS_NETWORK_BLOCKED: browser networking is disabled during export"); }
  for (const name of ["EventSource", "RTCPeerConnection", "SharedWorker", "WebSocket", "WebTransport", "Worker", "XMLHttpRequest", "webkitRTCPeerConnection"]) {
    if (name in globalThis) Object.defineProperty(globalThis, name, { configurable: false, enumerable: false, value: reject, writable: false });
  }
  Object.defineProperty(globalThis, "fetch", { configurable: false, enumerable: false, value: (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (!allowBlobFetch || typeof url !== "string" || !url.startsWith("blob:${virtualOrigin}/")) return reject();
    return nativeFetch(input, init);
  }, writable: false });
  if (globalThis.Navigator?.prototype && "sendBeacon" in globalThis.Navigator.prototype) Object.defineProperty(globalThis.Navigator.prototype, "sendBeacon", { configurable: false, value: reject, writable: false });
  const enableBlobFetch = (event) => {
    if (event.source !== globalThis || event.data?.type !== "threenative-enable-blob-fetch" || event.data?.token !== ${JSON.stringify(blobFetchToken)}) return;
    allowBlobFetch = true;
    globalThis.removeEventListener("message", enableBlobFetch);
  };
  globalThis.addEventListener("message", enableBlobFetch);
})();
`;
}
