#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const BLENDER = {
  archive: "blender-4.5.11-linux-x64.tar.xz",
  directory: "blender-4.5.11-linux-x64",
  platform: "linux-x64",
  sha256: "05ed7bd41bf3e61ae4f4a7cdc364c43088bf8b3fed702c2269c018fdf63a2188",
  url: "https://download.blender.org/release/Blender4.5/blender-4.5.11-linux-x64.tar.xz",
  version: "4.5.11",
};

const args = process.argv.slice(2);
const command = args[0];
const json = args.includes("--json");
const cacheRoot = resolve(process.env.TN_BLENDER_CACHE ?? join(homedir(), ".cache", "threenative", "tools", "blender"));
const installRoot = join(cacheRoot, BLENDER.version, BLENDER.platform);
const executable = join(installRoot, BLENDER.directory, "blender");

try {
  if (command === "status") {
    const installed = await exists(executable);
    finish({
      code: installed ? "TN_BLENDER_READY" : "TN_BLENDER_MISSING",
      executable: installed ? executable : null,
      installed,
      message: installed ? `Blender ${BLENDER.version} is ready.` : `Blender ${BLENDER.version} is not installed in the ThreeNative tool cache.`,
      version: BLENDER.version,
    }, installed ? 0 : 1);
  }

  if (command === "install") {
    assertSupportedPlatform();
    if (await exists(executable)) {
      finish({ code: "TN_BLENDER_READY", executable, installed: true, message: `Blender ${BLENDER.version} is already installed.`, version: BLENDER.version }, 0);
    }
    await installBlender();
    finish({ code: "TN_BLENDER_INSTALLED", executable, installed: true, message: `Installed Blender ${BLENDER.version} in the ThreeNative tool cache.`, version: BLENDER.version }, 0);
  }

  if (command === "generate") {
    assertSupportedPlatform();
    const input = readFlag("--input");
    const output = readFlag("--output");
    if (input === undefined || output === undefined) throw new Error("generate requires --input <job.json> and --output <asset.glb>.");
    if (!(await exists(executable))) {
      finish({
        code: "TN_BLENDER_MISSING",
        fix: { instruction: "Run the explicit Blender tool install command, review its download, then retry.", command: "node tools/spikes/blender-headless/blender-tool.mjs install --json" },
        installed: false,
        message: "Blender is optional and has not been downloaded. Generation did not install it implicitly.",
      }, 1);
    }
    const script = resolve(dirname(fileURLToPath(import.meta.url)), "generate_object.py");
    const result = await run(executable, ["--background", "--factory-startup", "--python-exit-code", "1", "--python", script, "--", "--input", resolve(input), "--output", resolve(output)]);
    if (result.exitCode !== 0) throw new Error(`Blender generation failed with exit code ${result.exitCode}.\n${result.stderr}`);
    finish({
      code: "TN_BLENDER_GENERATE_OK",
      input: resolve(input),
      message: `Generated ${basename(output)} with Blender ${BLENDER.version}.`,
      output: resolve(output),
      version: BLENDER.version,
    }, 0);
  }

  throw new Error("Usage: blender-tool.mjs <status|install|generate> [--input <job.json> --output <asset.glb>] [--json]");
} catch (error) {
  finish({ code: "TN_BLENDER_TOOL_FAILED", message: error instanceof Error ? error.message : String(error) }, 1);
}

async function installBlender() {
  const parent = dirname(installRoot);
  const staging = `${installRoot}.staging-${process.pid}`;
  const archive = join(staging, BLENDER.archive);
  await rm(staging, { force: true, recursive: true });
  await mkdir(staging, { recursive: true });
  try {
    const response = await fetch(BLENDER.url, { redirect: "follow" });
    if (!response.ok || response.body === null) throw new Error(`Blender download failed: HTTP ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    const actual = await hashFile(archive);
    if (actual !== BLENDER.sha256) throw new Error(`Blender checksum mismatch: expected ${BLENDER.sha256}, received ${actual}.`);
    const extraction = await run("tar", ["-xf", archive, "-C", staging]);
    if (extraction.exitCode !== 0) throw new Error(`Could not extract Blender: ${extraction.stderr}`);
    await rm(archive, { force: true });
    await mkdir(parent, { recursive: true });
    await rm(installRoot, { force: true, recursive: true });
    await rename(staging, installRoot);
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }
}

function assertSupportedPlatform() {
  if (`${process.platform}-${process.arch}` !== BLENDER.platform) {
    throw new Error(`This spike currently proves ${BLENDER.platform}; host is ${process.platform}-${process.arch}. A production manifest must add pinned macOS and Windows artifacts.`);
  }
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function run(file, argv) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(file, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolveRun({ exitCode: exitCode ?? 1, stderr, stdout }));
  });
}

function finish(payload, exitCode) {
  process.stdout.write(json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`);
  process.exit(exitCode);
}
