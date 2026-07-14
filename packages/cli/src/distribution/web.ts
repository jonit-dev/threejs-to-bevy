import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "@threenative/compiler";
import type { IDistributionSource } from "@threenative/ir";

export type WebDistributionFormat = "static" | "zip" | "pwa";

export interface IWebDistributionReport {
  artifact: {
    bytes: number;
    contentSha256: string;
    directory: string;
    zip?: { bytes: number; path: string; sha256: string };
  };
  bundleSha256: string;
  code: "TN_PACKAGE_WEB_OK";
  format: WebDistributionFormat;
  inventory: Array<{ bytes: number; mime: string; path: string; sha256: string }>;
  runtime: "web";
  schema: "threenative.package-report";
  signing: { status: "not-applicable" };
  target: "web";
  toolchain: { node: string; vite: string };
  version: "0.1.0";
}

export async function buildWebDistribution(options: {
  bundlePath: string;
  format: WebDistributionFormat;
  outputPath: string;
}): Promise<IWebDistributionReport> {
  const bundlePath = resolve(options.bundlePath);
  const outputPath = resolve(options.outputPath);
  const artifactPath = resolve(outputPath, "artifact");
  const sourcePath = resolve(outputPath, ".web-source");
  const validation = await validateBundle(bundlePath);
  if (!validation.ok) {
    throw new Error(`TN_PACKAGE_BUNDLE_INVALID: ${validation.diagnostics.length} bundle validation error(s).`);
  }
  assertSafeWebOutput(outputPath, bundlePath);
  const distribution = await readDistribution(bundlePath);
  await rm(outputPath, { force: true, recursive: true });
  await mkdir(resolve(sourcePath, "src"), { recursive: true });
  await writeWebSource(sourcePath, distribution.app.displayName, options.format === "pwa");
  await runViteBuild(sourcePath, artifactPath);
  await cp(bundlePath, resolve(artifactPath, "bundle"), { force: true, recursive: true });
  if (options.format === "pwa") await writePwaFiles(artifactPath, distribution);
  await rejectDevelopmentUrls(artifactPath);

  const inventory = await inventoryFiles(artifactPath);
  const contentSha256 = hashInventory(inventory);
  const report: IWebDistributionReport = {
    artifact: {
      bytes: inventory.reduce((total, file) => total + file.bytes, 0),
      contentSha256,
      directory: "artifact",
    },
    bundleSha256: hashInventory(inventory.filter((file) => file.path.startsWith("bundle/"))),
    code: "TN_PACKAGE_WEB_OK",
    format: options.format,
    inventory,
    runtime: "web",
    schema: "threenative.package-report",
    signing: { status: "not-applicable" },
    target: "web",
    toolchain: { node: process.version, vite: await viteVersion() },
    version: "0.1.0",
  };
  await rm(sourcePath, { force: true, recursive: true });
  await writeFile(resolve(outputPath, "asset-inventory.json"), `${JSON.stringify({ files: inventory, schema: "threenative.asset-inventory", version: "0.1.0" }, null, 2)}\n`);
  if (options.format === "zip") {
    const zipPath = resolve(outputPath, `${safeSlug(distribution.app.id)}-web.zip`);
    await writeDeterministicZip(artifactPath, inventory, zipPath);
    report.artifact.zip = { bytes: (await stat(zipPath)).size, path: basename(zipPath), sha256: await sha256File(zipPath) };
  }
  await writeFile(resolve(outputPath, "package-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function readDistribution(bundlePath: string): Promise<IDistributionSource> {
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as { files?: { distribution?: string } };
  if (manifest.files?.distribution === undefined) {
    throw new Error("TN_PACKAGE_DISTRIBUTION_MISSING: bundle manifest does not reference distribution IR.");
  }
  return JSON.parse(await readFile(resolve(bundlePath, manifest.files.distribution), "utf8")) as IDistributionSource;
}

async function writeWebSource(sourcePath: string, displayName: string, pwa: boolean): Promise<void> {
  await writeFile(resolve(sourcePath, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(displayName)}</title>
    ${pwa ? '<link rel="manifest" href="./manifest.webmanifest" />' : ""}
    <style>html,body,#app{width:100%;height:100%;margin:0}body{background:#111318;overflow:hidden}canvas{display:block;width:100%;height:100%}</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
`);
  await writeFile(resolve(sourcePath, "src/main.js"), `import ${JSON.stringify(fileURLToPath(new URL("../../../runtime-web-three/dist/browser/main.js", import.meta.url)))};
${pwa ? 'if("serviceWorker" in navigator)await navigator.serviceWorker.register("./sw.js");' : ""}
`);
}

async function writePwaFiles(artifactPath: string, distribution: IDistributionSource): Promise<void> {
  await writeFile(resolve(artifactPath, "manifest.webmanifest"), `${JSON.stringify({
    display: "standalone",
    id: "./",
    name: distribution.app.displayName,
    scope: "./",
    short_name: distribution.app.displayName,
    start_url: "./",
  }, null, 2)}\n`);
  const cachePaths = (await relativeFiles(artifactPath)).filter((path) => path !== "sw.js").map((path) => `./${path}`);
  await writeFile(resolve(artifactPath, "sw.js"), `const CACHE=${JSON.stringify(`threenative-${distribution.app.id}-${distribution.app.version}`)};
const FILES=${JSON.stringify(cachePaths)};
self.addEventListener("install",(event)=>event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(FILES))));
self.addEventListener("activate",(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))))));
self.addEventListener("fetch",(event)=>event.respondWith(caches.match(event.request).then((cached)=>cached||fetch(event.request))));
`);
}

async function rejectDevelopmentUrls(root: string): Promise<void> {
  const forbidden = /(?:https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?|file:\/\/|\b[A-Za-z]:\\|(?:^|["'\s])\/(?:home|Users|workspace|build|private\/tmp|tmp|var\/folders)\/)/m;
  for (const path of await relativeFiles(root)) {
    if (!/\.(?:css|html|js|json|map|txt|webmanifest)$/i.test(path)) continue;
    const contents = await readFile(resolve(root, path), "utf8");
    if (forbidden.test(contents)) throw new Error(`TN_PACKAGE_WEB_DEVELOPMENT_URL_FORBIDDEN: release artifact '${path}' contains a local development URL or absolute host path.`);
  }
}

function assertSafeWebOutput(outputPath: string, bundlePath: string): void {
  const protectedRoots = [resolve("/"), resolve(process.cwd()), resolve(homedir()), resolve(tmpdir())];
  if (protectedRoots.includes(outputPath)) {
    throw new Error(`TN_PACKAGE_OUTPUT_UNSAFE: refusing to remove protected output root '${outputPath}'.`);
  }
  if (pathsOverlap(outputPath, bundlePath)) {
    throw new Error(`TN_PACKAGE_OUTPUT_OVERLAP: web output '${outputPath}' must not contain or be contained by source bundle '${bundlePath}'.`);
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return pathContains(left, right) || pathContains(right, left);
}

function pathContains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function inventoryFiles(root: string): Promise<IWebDistributionReport["inventory"]> {
  const rows = [];
  for (const path of await relativeFiles(root)) {
    rows.push({ bytes: (await stat(resolve(root, path))).size, mime: mimeFor(path), path, sha256: await sha256File(resolve(root, path)) });
  }
  return rows;
}

async function relativeFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const rows = await Promise.all(entries.map(async (entry) => {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? relativeFiles(root, path) : [path];
  }));
  return rows.flat().sort();
}

function hashInventory(inventory: IWebDistributionReport["inventory"]): string {
  return createHash("sha256").update(inventory.map((file) => `${file.sha256}  ${file.path}\n`).join("")).digest("hex");
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

async function runViteBuild(sourcePath: string, artifactPath: string): Promise<void> {
  const executable = resolve(fileURLToPath(new URL("../../../../node_modules/.bin/vite", import.meta.url)));
  await run(executable, ["build", sourcePath, "--base", "./", "--outDir", artifactPath, "--emptyOutDir"]);
}

async function viteVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(fileURLToPath(new URL("../../../runtime-web-three/node_modules/vite/package.json", import.meta.url)), "utf8")) as { version: string };
  return packageJson.version;
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`TN_PACKAGE_WEB_BUILD_FAILED: ${stderr.trim()}`)));
  });
}

async function writeDeterministicZip(root: string, inventory: IWebDistributionReport["inventory"], outputPath: string): Promise<void> {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const file of inventory) {
    const name = Buffer.from(file.path);
    const data = await readFile(resolve(root, file.path));
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE((0o100644 << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralBytes = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(inventory.length, 8); end.writeUInt16LE(inventory.length, 10); end.writeUInt32LE(centralBytes, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat([...localParts, ...centralParts, end]));
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function mimeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  if (path.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
