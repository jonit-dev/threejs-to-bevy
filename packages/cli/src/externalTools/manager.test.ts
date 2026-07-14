import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { toolCommand } from "../commands/tool.js";
import { ExternalToolError, ExternalToolManager, extractOfficialArtifact, runBoundedProcess, validateArchiveEntries, validateArchiveLinkTargets, type IExternalToolManagerDependencies } from "./manager.js";
import type { IExternalToolArtifact, IExternalToolDefinition } from "./registry.js";

const artifactBytes = Buffer.from("small pinned blender fixture");
const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
const execFileAsync = promisify(execFile);

test("should report missing without network or writes when cache is empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-missing-"));
  const cache = join(root, "cache-that-does-not-exist");
  let fetches = 0;
  const manager = createManager(cache, {
    fetch: async () => { fetches += 1; return response(); },
  });

  const result = await manager.status("blender");

  assert.equal(result.code, "TN_EXTERNAL_TOOL_MISSING");
  assert.equal(result.ready, false);
  assert.equal(fetches, 0);
  await assert.rejects(access(cache));
});

test("should require explicit acknowledgement before download", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-ack-"));
  const cache = join(root, "cache");
  let fetches = 0;
  const manager = createManager(cache, {
    fetch: async () => { fetches += 1; return response(); },
  });

  await assert.rejects(
    manager.install("blender", { acceptDownload: false }),
    (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_ACKNOWLEDGEMENT_MISSING" && error.details.sha256 === artifactSha256,
  );
  assert.equal(fetches, 0);
  await assert.rejects(access(cache));
});

test("should reject an unsupported host before network or cache writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-unsupported-host-"));
  const cache = join(root, "cache");
  let fetches = 0;
  const manager = createManager(cache, { arch: "ppc64", fetch: async () => { fetches += 1; return response(); }, platform: "aix" });

  await assert.rejects(manager.install("blender", { acceptDownload: true }), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_UNSUPPORTED_HOST");
  assert.equal(fetches, 0);
  await assert.rejects(access(cache));
});

test("should reject insufficient disk space before download", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-disk-space-"));
  const cache = join(root, "cache");
  const baseline = createManager(cache);
  let fetches = 0;
  const manager = createManager(cache, {
    fetch: async () => { fetches += 1; return response(); },
    fileSystem: { ...baseline.dependencies.fileSystem, statfs: async () => ({ bavail: 0, bsize: 1 }) },
  });

  await assert.rejects(manager.install("blender", { acceptDownload: true }), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_DISK_SPACE");
  assert.equal(fetches, 0);
});

test("should fail closed when stale staging cannot be cleaned", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-stale-staging-"));
  const cache = join(root, "cache");
  const stalePath = join(cache, "blender", "4.5.11", "linux-x64.staging-old");
  await mkdir(stalePath, { recursive: true });
  const baseline = createManager(cache);
  const manager = createManager(cache, {
    fileSystem: {
      ...baseline.dependencies.fileSystem,
      rm: async (path, options) => {
        if (path === stalePath) throw new Error("permission denied");
        await baseline.dependencies.fileSystem.rm(path, options);
      },
    },
    timeoutMs: 0,
  });

  await assert.rejects(manager.install("blender", { acceptDownload: true }), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_STALE_STAGING_FAILED");
  await access(stalePath);
});

test("should install atomically when artifact and hash are valid", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-install-"));
  const cache = join(root, "cache");
  const finalExecutable = join(cache, "blender", "4.5.11", "linux-x64", "blender-fixture", "blender");
  let probedStagedExecutable = false;
  const manager = createManager(cache, {
    runProcess: async (executable) => {
      if (executable.includes(".staging-")) {
        probedStagedExecutable = true;
        await access(executable);
        await assert.rejects(access(finalExecutable));
      }
      return successfulProbe();
    },
  });

  const result = await manager.install("blender", { acceptDownload: true });

  assert.equal(result.code, "TN_EXTERNAL_TOOL_READY");
  assert.equal(result.reused, false);
  assert.equal(result.downloadBytes, artifactBytes.length);
  assert.equal(result.sha256, artifactSha256);
  assert.equal(probedStagedExecutable, true);
  assert.equal(await readFile(finalExecutable, "utf8"), "executable");
});

test("should remove staging when checksum mismatches", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-hash-"));
  const cache = join(root, "cache");
  const manager = createManager(cache, {
    fetch: async () => new Response("wrong bytes", { headers: { "content-length": "11" }, status: 200 }),
  });

  await assert.rejects(manager.install("blender", { acceptDownload: true }), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_HASH_MISMATCH");

  const hostParent = join(cache, "blender", "4.5.11");
  assert.deepEqual(await readdir(hostParent), []);
});

test("should remove staging when a download stream is interrupted", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-interrupted-"));
  const cache = join(root, "cache");
  const manager = createManager(cache, {
    fetch: async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial archive"));
        controller.error(new Error("connection reset"));
      },
    }), { status: 200 }),
  });

  await assert.rejects(manager.install("blender", { acceptDownload: true }), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_HTTP_FAILED");
  assert.deepEqual(await readdir(join(cache, "blender", "4.5.11")), []);
});

test("should serialize concurrent installs for the same tool", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-concurrent-"));
  const cache = join(root, "cache");
  let fetches = 0;
  let extractions = 0;
  const manager = createManager(cache, {
    extract: async (artifact, _archivePath, destination) => {
      extractions += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      const executable = join(destination, artifact.executablePath);
      await mkdir(dirname(executable), { recursive: true });
      await writeFile(executable, "executable");
    },
    fetch: async () => { fetches += 1; return response(); },
  });

  const [first, second] = await Promise.all([
    manager.install("blender", { acceptDownload: true }),
    manager.install("blender", { acceptDownload: true }),
  ]);

  assert.equal(fetches, 1);
  assert.equal(extractions, 1);
  assert.deepEqual([first.reused, second.reused].sort(), [false, true]);
});

test("should prefer explicit Blender path when version is supported", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-override-"));
  const cache = join(root, "cache");
  const override = join(root, "system", "blender");
  await mkdir(dirname(override), { recursive: true });
  await writeFile(override, "system executable");
  let fetches = 0;
  const manager = createManager(cache, {
    env: { THREENATIVE_BLENDER_PATH: override, THREENATIVE_TOOL_CACHE: cache },
    fetch: async () => { fetches += 1; return response(); },
  });

  const result = await manager.install("blender", { acceptDownload: false });

  assert.equal(result.source, "override");
  assert.equal(result.executablePath, override);
  assert.equal(result.reused, true);
  assert.equal(fetches, 0);
  await assert.rejects(access(cache));
});

test("should refuse removal of an override executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-remove-override-"));
  const override = join(root, "blender");
  await writeFile(override, "system executable");
  const manager = createManager(join(root, "cache"), {
    env: { THREENATIVE_BLENDER_PATH: override, THREENATIVE_TOOL_CACHE: join(root, "cache") },
  });

  await assert.rejects(manager.remove("blender"), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_REMOVAL_FAILED");
  assert.equal(await readFile(override, "utf8"), "system executable");
});

test("should reject archive traversal entries before extraction", () => {
  assert.throws(() => validateArchiveEntries("blender/readme.txt\n../escape\n"), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_EXTRACTION_FAILED");
  assert.throws(() => validateArchiveEntries("C:\\escape\\blender.exe\n"), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_EXTRACTION_FAILED");
  assert.doesNotThrow(() => validateArchiveEntries("blender-4.5.11/blender\nblender-4.5.11/data/readme.txt\n"));
});

test("should reclaim a stale install lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-stale-lock-"));
  const cache = join(root, "cache");
  const lockPath = join(cache, "blender", "4.5.11", "linux-x64.lock");
  await mkdir(lockPath, { recursive: true });
  const manager = createManager(cache, { lockStaleMs: 0 });

  const result = await manager.install("blender", { acceptDownload: true });

  assert.equal(result.ready, true);
  await assert.rejects(access(lockPath));
});

test("should not promote or release after stale-lock ownership is replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-lock-owner-"));
  const cache = join(root, "cache");
  let firstStarted!: () => void;
  let secondStarted!: () => void;
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
  const secondStartedPromise = new Promise<void>((resolve) => { secondStarted = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
  const extract = (started: () => void, gate: Promise<void>): IExternalToolManagerDependencies["extract"] => async (artifact, _archivePath, destination) => {
    started();
    await gate;
    const executable = join(destination, artifact.executablePath);
    await mkdir(dirname(executable), { recursive: true });
    await writeFile(executable, "executable");
  };
  const first = createManager(cache, { extract: extract(firstStarted, firstGate), lockStaleMs: 0 });
  const second = createManager(cache, { extract: extract(secondStarted, secondGate), lockStaleMs: 0 });

  const firstInstall = first.install("blender", { acceptDownload: true });
  await firstStartedPromise;
  const secondInstall = second.install("blender", { acceptDownload: true });
  await secondStartedPromise;
  releaseFirst();
  await assert.rejects(firstInstall, (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_LOCK_CONTENTION");
  releaseSecond();
  const result = await secondInstall;
  assert.equal(result.ready, true);
});

test("should replace a corrupt managed executable under the install lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-corrupt-"));
  const cache = join(root, "cache");
  const executable = join(cache, "blender", "4.5.11", "linux-x64", "blender-fixture", "blender");
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(executable, "corrupt");
  let fetches = 0;
  const manager = createManager(cache, {
    fetch: async () => { fetches += 1; return response(); },
    runProcess: async (path) => (await readFile(path, "utf8")) === "corrupt"
      ? { exitCode: 1, stderr: "bad executable", stdout: "", timedOut: false }
      : successfulProbe(),
  });

  const result = await manager.install("blender", { acceptDownload: true });

  assert.equal(result.ready, true);
  assert.equal(fetches, 1);
  assert.equal(await readFile(executable, "utf8"), "executable");
});

test("should return a structured install fix for missing status", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-status-fix-"));
  const result = await toolCommand(["status", "blender", "--json"], createManager(join(root, "cache")));
  const payload = JSON.parse(result.stdout) as { fix?: { instruction?: string } };
  assert.match(payload.fix?.instruction ?? "", /tool install blender --accept-download --json/);
});

test("should inspect complete real tar and zip archives before extraction", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-real-archives-"));
  const source = join(root, "source");
  const executable = join(source, "blender-fixture", "blender");
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(executable, "executable");
  const manager = createManager(join(root, "cache"));

  for (const [archive, command] of [["tar.xz", "tar"], ["zip", "bsdtar"]] as const) {
    const archivePath = join(root, `fixture.${archive === "zip" ? "zip" : "tar.xz"}`);
    if (archive === "zip") await execFileAsync(command, ["-a", "-cf", archivePath, "-C", source, "blender-fixture"]);
    else await execFileAsync(command, ["-cJf", archivePath, "-C", source, "blender-fixture"]);
    const destination = join(root, `extracted-${archive}`);
    await mkdir(destination, { recursive: true });
    await extractOfficialArtifact(testArtifact(archive), archivePath, destination, {
      fileSystem: manager.dependencies.fileSystem,
      runProcess: archiveRunner(command),
    });
    assert.equal(await readFile(join(destination, "blender-fixture", "blender"), "utf8"), "executable");
  }
});

test("should reject real tar and zip link traversal before extraction writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-link-archive-"));
  const source = join(root, "source");
  await mkdir(source, { recursive: true });
  await symlink("../../escape", join(source, "outside-link"));
  const manager = createManager(join(root, "cache"));
  for (const [archive, command] of [["tar.xz", "tar"], ["zip", "bsdtar"]] as const) {
    const archivePath = join(root, `malicious.${archive === "zip" ? "zip" : "tar.xz"}`);
    if (archive === "zip") await execFileAsync(command, ["-a", "-cf", archivePath, "-C", source, "outside-link"]);
    else await execFileAsync(command, ["-cJf", archivePath, "-C", source, "outside-link"]);
    const destination = join(root, `extracted-${archive}`);
    await mkdir(destination, { recursive: true });
    await assert.rejects(
      extractOfficialArtifact(testArtifact(archive), archivePath, destination, {
        fileSystem: manager.dependencies.fileSystem,
        runProcess: archiveRunner(command),
      }),
      (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_EXTRACTION_FAILED",
    );
    assert.deepEqual(await readdir(destination), []);
  }
  await assert.rejects(access(join(root, "escape")));
});

test("should reject a real tar traversal name before extraction writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-name-archive-"));
  const source = join(root, "source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "payload"), "escape");
  const archivePath = join(root, "malicious.tar.xz");
  await execFileAsync("tar", ["-cJf", archivePath, "--transform=s#^payload$#../escape#", "-C", source, "payload"]);
  const destination = join(root, "extracted");
  await mkdir(destination, { recursive: true });
  const manager = createManager(join(root, "cache"));
  await assert.rejects(
    extractOfficialArtifact(testArtifact("tar.xz"), archivePath, destination, {
      fileSystem: manager.dependencies.fileSystem,
      runProcess: archiveRunner("tar"),
    }),
    (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_EXTRACTION_FAILED",
  );
  assert.deepEqual(await readdir(destination), []);
  await assert.rejects(access(join(root, "escape")));
});

test("should fail closed when a full archive manifest exceeds its bound", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-manifest-bound-"));
  const destination = join(root, "extracted");
  await mkdir(destination, { recursive: true });
  const manager = createManager(join(root, "cache"));
  let calls = 0;

  await assert.rejects(
    extractOfficialArtifact(testArtifact("tar.xz"), join(root, "fixture.tar.xz"), destination, {
      fileSystem: manager.dependencies.fileSystem,
      runProcess: async () => {
        calls += 1;
        return { exitCode: 0, outputTruncated: true, stderr: "", stdout: "safe-tail\n", timedOut: false };
      },
    }),
    (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_EXTRACTION_FAILED",
  );
  assert.equal(calls, 1);
});

test("should reject unsafe symlink and hardlink targets", () => {
  assert.throws(() => validateArchiveLinkTargets("lrwxrwxrwx user/group 0 date link -> ../../escape\n"), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_EXTRACTION_FAILED");
  assert.throws(() => validateArchiveLinkTargets("hrw-r--r-- user/group 0 date link link to C:\\escape\n"), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_EXTRACTION_FAILED");
  assert.doesNotThrow(() => validateArchiveLinkTargets("lrwxrwxrwx user/group 0 date link -> sibling\n"));
});

test("should refuse to download when an explicit override fails its probe", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-invalid-override-"));
  const override = join(root, "blender");
  await writeFile(override, "unsupported");
  let fetches = 0;
  const manager = createManager(join(root, "cache"), {
    env: { THREENATIVE_BLENDER_PATH: override, THREENATIVE_TOOL_CACHE: join(root, "cache") },
    fetch: async () => { fetches += 1; return response(); },
    runProcess: async () => ({ exitCode: 1, stderr: "unsupported", stdout: "", timedOut: false }),
  });

  await assert.rejects(manager.install("blender", { acceptDownload: true }), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_PROBE_FAILED");
  assert.equal(fetches, 0);
  await assert.rejects(access(join(root, "cache")));
});

test("should replace a managed executable whose probe times out", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-timeout-repair-"));
  const cache = join(root, "cache");
  const executable = join(cache, "blender", "4.5.11", "linux-x64", "blender-fixture", "blender");
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(executable, "hung");
  const manager = createManager(cache, {
    runProcess: async (path) => (await readFile(path, "utf8")) === "hung"
      ? { exitCode: null, stderr: "", stdout: "", timedOut: true }
      : successfulProbe(),
  });

  const result = await manager.install("blender", { acceptDownload: true });
  assert.equal(result.ready, true);
  assert.equal(await readFile(executable, "utf8"), "executable");
});

test("should serialize remove behind an active install", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-remove-lock-"));
  const cache = join(root, "cache");
  let releaseExtraction!: () => void;
  const extractionStarted = new Promise<void>((resolveStarted) => {
    releaseExtraction = resolveStarted;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolveStarted) => { markStarted = resolveStarted; });
  const manager = createManager(cache, {
    extract: async (artifact, _archivePath, destination) => {
      markStarted();
      await extractionStarted;
      const executable = join(destination, artifact.executablePath);
      await mkdir(dirname(executable), { recursive: true });
      await writeFile(executable, "executable");
    },
  });
  const installPromise = manager.install("blender", { acceptDownload: true });
  await started;
  const removePromise = manager.remove("blender");
  releaseExtraction();

  const [installed, removed] = await Promise.all([installPromise, removePromise]);
  assert.equal(installed.ready, true);
  assert.equal(removed.removed, true);
  await assert.rejects(access(removed.cachePath));
});

test("should bound Windows timeout cleanup when taskkill is unavailable", async () => {
  const started = Date.now();
  const result = await runBoundedProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { platform: "win32", timeoutMs: 25 });
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 2_000);
});

test("should kill a real descendant process tree on Linux timeout", async () => {
  const script = "const spawn=process.getBuiltinModule('node:child_process').spawn;const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(child.pid);setInterval(()=>{},1000);";
  const result = await runBoundedProcess(process.execPath, ["-e", script], { platform: "linux", timeoutMs: 500 });
  const descendantPid = Number(/\d+/u.exec(result.stdout)?.[0]);
  assert.equal(result.timedOut, true);
  assert.ok(Number.isInteger(descendantPid) && descendantPid > 0);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { process.kill(descendantPid, 0); }
    catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`descendant process ${descendantPid} survived the timed-out process-group kill`);
});

test("should retry a failed macOS detach with force", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-dmg-detach-"));
  const destination = join(root, "runtime");
  const manager = createManager(join(root, "cache"));
  const calls: string[][] = [];
  await extractOfficialArtifact(testArtifact("dmg"), join(root, "fixture.dmg"), destination, {
    fileSystem: { ...manager.dependencies.fileSystem, copy: async () => undefined },
    runProcess: async (executable, args) => {
      calls.push([executable, ...args]);
      if (args[0] === "detach" && args[1] !== "-force") return { exitCode: 1, stderr: "busy", stdout: "", timedOut: false };
      return { exitCode: 0, stderr: "", stdout: "", timedOut: false };
    },
  });
  assert.ok(calls.some((args) => args[1] === "detach" && args[2] === "-force"));
});

test("should normalize promotion filesystem failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-tool-promotion-failure-"));
  const manager = createManager(join(root, "cache"));
  const failingManager = createManager(join(root, "cache"), {
    fileSystem: {
      ...manager.dependencies.fileSystem,
      rename: async () => { throw new Error("rename denied"); },
    },
  });
  await assert.rejects(failingManager.install("blender", { acceptDownload: true }), (error: unknown) => error instanceof ExternalToolError && error.code === "TN_EXTERNAL_TOOL_INSTALL_FAILED");
});

function createManager(cache: string, overrides: Partial<IExternalToolManagerDependencies> = {}): ExternalToolManager {
  return new ExternalToolManager({
    arch: "x64",
    env: { THREENATIVE_TOOL_CACHE: cache },
    extract: async (artifact, _archivePath, destination) => {
      const executable = join(destination, artifact.executablePath);
      await mkdir(dirname(executable), { recursive: true });
      await writeFile(executable, "executable");
    },
    fetch: async () => response(),
    platform: "linux",
    resolveDefinition: (id) => id === "blender" ? fixtureDefinition() : undefined,
    runProcess: async () => successfulProbe(),
    ...overrides,
  });
}

function archiveRunner(command: string): IExternalToolManagerDependencies["runProcess"] {
  return (executable, args, options) => runBoundedProcess(executable === "tar" ? command : executable, args, options);
}

function testArtifact(archive: "dmg" | "tar.xz" | "zip"): IExternalToolArtifact {
  return {
    archive,
    archiveFile: `fixture.${archive === "zip" ? "zip" : archive}`,
    executablePath: archive === "dmg" ? "Blender.app/Contents/MacOS/Blender" : "blender-fixture/blender",
    expectedBytes: 1,
    host: "linux-x64",
    sha256: "0".repeat(64),
    url: "https://example.invalid/fixture",
  };
}

function fixtureDefinition(): IExternalToolDefinition {
  const artifact = {
    archive: "tar.xz" as const,
    archiveFile: "blender-fixture.tar.xz",
    executablePath: "blender-fixture/blender",
    expectedBytes: artifactBytes.length,
    host: "linux-x64" as const,
    sha256: artifactSha256,
    url: "https://download.blender.org/release/fixture/blender-fixture.tar.xz",
  };
  return {
    artifacts: {
      "darwin-arm64": { ...artifact, host: "darwin-arm64" },
      "darwin-x64": { ...artifact, host: "darwin-x64" },
      "linux-x64": artifact,
      "win32-x64": { ...artifact, host: "win32-x64" },
    },
    id: "blender",
    license: { name: "GPL-3.0-or-later", url: "https://developer.blender.org/docs/license/" },
    sourceUrl: "https://download.blender.org/source/",
    version: "4.5.11",
    versionProbe: { args: ["--version"], outputPattern: /^Blender 4\.5\.11/m },
  };
}

function response(): Response {
  return new Response(artifactBytes, { headers: { "content-length": String(artifactBytes.length) }, status: 200 });
}

function successfulProbe(): { exitCode: number; stderr: string; stdout: string; timedOut: boolean } {
  return { exitCode: 0, stderr: "", stdout: "Blender 4.5.11\n", timedOut: false };
}
