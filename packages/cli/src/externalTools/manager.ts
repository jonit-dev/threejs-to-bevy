import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, statfs } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { externalToolHost, getExternalToolDefinition, type ExternalToolHost, type ExternalToolId, type IExternalToolArtifact, type IExternalToolDefinition } from "./registry.js";

export type ExternalToolDiagnosticCode =
  | "TN_EXTERNAL_TOOL_ACKNOWLEDGEMENT_MISSING"
  | "TN_EXTERNAL_TOOL_DISK_SPACE"
  | "TN_EXTERNAL_TOOL_EXTRACTION_FAILED"
  | "TN_EXTERNAL_TOOL_HASH_MISMATCH"
  | "TN_EXTERNAL_TOOL_HTTP_FAILED"
  | "TN_EXTERNAL_TOOL_INSTALL_FAILED"
  | "TN_EXTERNAL_TOOL_LOCK_CONTENTION"
  | "TN_EXTERNAL_TOOL_MISSING"
  | "TN_EXTERNAL_TOOL_PROBE_FAILED"
  | "TN_EXTERNAL_TOOL_REMOVAL_FAILED"
  | "TN_EXTERNAL_TOOL_STALE_STAGING_FAILED"
  | "TN_EXTERNAL_TOOL_TIMEOUT"
  | "TN_EXTERNAL_TOOL_UNSUPPORTED_HOST";

export interface IExternalToolStatus {
  artifact: IExternalToolArtifact;
  cachePath: string;
  code: "TN_EXTERNAL_TOOL_MISSING" | "TN_EXTERNAL_TOOL_READY";
  executablePath: string;
  id: ExternalToolId;
  license: IExternalToolDefinition["license"];
  ready: boolean;
  source: "managed" | "missing" | "override";
  sourceUrl: string;
  version: string;
  versionOutput?: string;
}

export interface IExternalToolInstallResult extends IExternalToolStatus {
  downloadBytes: number;
  downloadMilliseconds: number;
  freeSpaceEstimate: number;
  reused: boolean;
  sha256: string;
}

export interface IExternalToolRemoveResult {
  cachePath: string;
  code: "TN_EXTERNAL_TOOL_REMOVED";
  id: ExternalToolId;
  removed: boolean;
  version: string;
}

export interface IProcessResult {
  exitCode: number | null;
  outputTruncated?: boolean;
  peakMemoryBytes?: number;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

interface IDownloadResult {
  bytes: number;
  milliseconds: number;
  sha256: string;
}

interface IExternalToolLock {
  assertOwned(): Promise<void>;
  release(): Promise<void>;
}

export interface IExternalToolFileSystem {
  access(path: string): Promise<void>;
  copy(source: string, destination: string, options: { recursive: boolean }): Promise<void>;
  createWriteStream(path: string): NodeJS.WritableStream;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  readdir(path: string): Promise<string[]>;
  rename(source: string, destination: string): Promise<void>;
  rm(path: string, options: { force?: boolean; recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<{ mtimeMs: number }>;
  statfs(path: string): Promise<{ bavail: number | bigint; bsize: number | bigint }>;
}

export interface IExternalToolManagerDependencies {
  arch: string;
  env: NodeJS.ProcessEnv;
  extract(artifact: IExternalToolArtifact, archivePath: string, destination: string, dependencies: Pick<IExternalToolManagerDependencies, "fileSystem" | "runProcess">): Promise<void>;
  fetch: typeof globalThis.fetch;
  fileSystem: IExternalToolFileSystem;
  homeDirectory: string;
  lockStaleMs: number;
  lockTimeoutMs: number;
  now(): number;
  platform: NodeJS.Platform;
  resolveDefinition(id: string): IExternalToolDefinition | undefined;
  runProcess(executable: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; maxOutputBytes?: number; platform?: NodeJS.Platform; timeoutMs: number }): Promise<IProcessResult>;
  sleep(milliseconds: number): Promise<void>;
  timeoutMs: number;
  uniqueId(): string;
}

const defaultFileSystem: IExternalToolFileSystem = {
  access,
  copy: cp,
  createWriteStream,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  statfs,
};

const defaultDependencies: IExternalToolManagerDependencies = {
  arch: process.arch,
  env: process.env,
  extract: extractOfficialArtifact,
  fetch: globalThis.fetch,
  fileSystem: defaultFileSystem,
  homeDirectory: homedir(),
  lockStaleMs: 30 * 60_000,
  lockTimeoutMs: 15_000,
  now: Date.now,
  platform: process.platform,
  resolveDefinition: getExternalToolDefinition,
  runProcess: runBoundedProcess,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs: 10 * 60_000,
  uniqueId: () => `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
};

export class ExternalToolError extends Error {
  readonly code: ExternalToolDiagnosticCode;
  readonly details: Record<string, unknown>;

  constructor(code: ExternalToolDiagnosticCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ExternalToolError";
    this.code = code;
    this.details = details;
  }
}

export class ExternalToolManager {
  readonly dependencies: IExternalToolManagerDependencies;

  constructor(dependencies: Partial<IExternalToolManagerDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async status(idInput: string): Promise<IExternalToolStatus> {
    const { artifact, definition, id } = this.resolveDefinition(idInput);
    const cachePath = this.cachePath(id, definition.version, artifact.host);
    const override = id === "blender" ? this.dependencies.env.THREENATIVE_BLENDER_PATH?.trim() : undefined;
    if (override !== undefined && override !== "") {
      const versionOutput = await this.probe(override, definition);
      return this.readyStatus(definition, artifact, cachePath, override, "override", versionOutput);
    }

    const executablePath = join(cachePath, artifact.executablePath);
    if (!(await exists(this.dependencies.fileSystem, executablePath))) {
      return {
        artifact,
        cachePath,
        code: "TN_EXTERNAL_TOOL_MISSING",
        executablePath,
        id,
        license: definition.license,
        ready: false,
        source: "missing",
        sourceUrl: definition.sourceUrl,
        version: definition.version,
      };
    }
    const versionOutput = await this.probe(executablePath, definition);
    return this.readyStatus(definition, artifact, cachePath, executablePath, "managed", versionOutput);
  }

  async install(idInput: string, options: { acceptDownload: boolean }): Promise<IExternalToolInstallResult> {
    const { artifact, definition, id } = this.resolveDefinition(idInput);
    const hasOverride = id === "blender" && (this.dependencies.env.THREENATIVE_BLENDER_PATH?.trim() ?? "") !== "";
    let initial: IExternalToolStatus;
    try {
      initial = await this.status(id);
    } catch (error) {
      if (hasOverride || !isRepairableProbeFailure(error)) throw error;
      initial = this.missingStatus(definition, artifact);
    }
    const freeSpaceEstimate = artifact.expectedBytes * 4;
    if (initial.ready) {
      return { ...initial, downloadBytes: 0, downloadMilliseconds: 0, freeSpaceEstimate, reused: true, sha256: artifact.sha256 };
    }
    if (!options.acceptDownload) {
      throw new ExternalToolError(
        "TN_EXTERNAL_TOOL_ACKNOWLEDGEMENT_MISSING",
        `Installing '${id}' downloads ${artifact.expectedBytes} bytes from ${artifact.url}. Pass --accept-download to continue.`,
        this.installDisclosure(definition, artifact, initial.cachePath, freeSpaceEstimate),
      );
    }

    const cacheParent = dirname(initial.cachePath);
    await this.installFileSystemOperation(
      () => this.dependencies.fileSystem.mkdir(cacheParent, { recursive: true }),
      `Could not prepare external-tool cache directory '${cacheParent}'.`,
      { cacheParent },
    );
    const installLock = await this.acquireLock(`${initial.cachePath}.lock`);
    let stagingPath: string | undefined;
    try {
      let current: IExternalToolStatus;
      try {
        current = await this.status(id);
      } catch (error) {
        if (!isRepairableProbeFailure(error)) throw error;
        await this.installFileSystemOperation(
          () => this.dependencies.fileSystem.rm(initial.cachePath, { force: true, recursive: true }),
          `Could not remove corrupt managed '${id}' cache entry '${initial.cachePath}'.`,
          { cachePath: initial.cachePath },
        );
        current = this.missingStatus(definition, artifact);
      }
      if (current.ready) {
        return { ...current, downloadBytes: 0, downloadMilliseconds: 0, freeSpaceEstimate, reused: true, sha256: artifact.sha256 };
      }
      await this.cleanupStaging(cacheParent, `${artifact.host}.staging-`);
      const availableBytes = await this.availableBytes(cacheParent);
      if (availableBytes < freeSpaceEstimate) {
        throw new ExternalToolError("TN_EXTERNAL_TOOL_DISK_SPACE", `Installing '${id}' needs approximately ${freeSpaceEstimate} free bytes, but only ${availableBytes} are available.`, { availableBytes, freeSpaceEstimate });
      }

      stagingPath = join(cacheParent, `${artifact.host}.staging-${this.dependencies.uniqueId()}`);
      const archivePath = join(stagingPath, artifact.archiveFile);
      const extractedPath = join(stagingPath, "runtime");
      await this.installFileSystemOperation(
        () => this.dependencies.fileSystem.mkdir(extractedPath, { recursive: true }),
        `Could not create external-tool staging directory '${extractedPath}'.`,
        { stagingPath: extractedPath },
      );
      const download = await this.download(artifact, archivePath);
      await installLock.assertOwned();
      if (download.sha256 !== artifact.sha256) {
        throw new ExternalToolError("TN_EXTERNAL_TOOL_HASH_MISMATCH", `Checksum mismatch for '${artifact.archiveFile}'.`, { actualSha256: download.sha256, expectedSha256: artifact.sha256 });
      }
      try {
        await this.dependencies.extract(artifact, archivePath, extractedPath, this.dependencies);
      } catch (error) {
        if (error instanceof ExternalToolError) throw error;
        throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Could not extract '${artifact.archiveFile}': ${errorMessage(error)}`);
      }
      const stagedExecutable = join(extractedPath, artifact.executablePath);
      await this.probe(stagedExecutable, definition);
      await installLock.assertOwned();
      await this.installFileSystemOperation(
        () => this.dependencies.fileSystem.rm(initial.cachePath, { force: true, recursive: true }),
        `Could not prepare managed '${id}' cache entry '${initial.cachePath}' for promotion.`,
        { cachePath: initial.cachePath },
      );
      await this.installFileSystemOperation(
        () => this.dependencies.fileSystem.rename(extractedPath, initial.cachePath),
        `Could not atomically promote managed '${id}' cache entry '${initial.cachePath}'.`,
        { cachePath: initial.cachePath, stagingPath: extractedPath },
      );
      const installed = await this.status(id);
      return { ...installed, downloadBytes: download.bytes, downloadMilliseconds: download.milliseconds, freeSpaceEstimate, reused: false, sha256: download.sha256 };
    } finally {
      let cleanupError: ExternalToolError | undefined;
      if (stagingPath !== undefined) {
        try {
          await this.dependencies.fileSystem.rm(stagingPath, { force: true, recursive: true });
        } catch (error) {
          cleanupError = new ExternalToolError("TN_EXTERNAL_TOOL_STALE_STAGING_FAILED", `Could not clean external-tool staging '${stagingPath}': ${errorMessage(error)}`, { stagingPath });
        }
      }
      try {
        await installLock.release();
      } catch (error) {
        cleanupError ??= error instanceof ExternalToolError
          ? error
          : new ExternalToolError("TN_EXTERNAL_TOOL_LOCK_CONTENTION", `Could not release external-tool install lock: ${errorMessage(error)}`);
      }
      if (cleanupError !== undefined) throw cleanupError;
    }
  }

  async remove(idInput: string): Promise<IExternalToolRemoveResult> {
    const { artifact, definition, id } = this.resolveDefinition(idInput);
    const cachePath = this.cachePath(id, definition.version, artifact.host);
    const override = id === "blender" ? this.dependencies.env.THREENATIVE_BLENDER_PATH?.trim() : undefined;
    if (override !== undefined && override !== "") {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_REMOVAL_FAILED", `Refusing to remove override executable '${override}'. Unset THREENATIVE_BLENDER_PATH to select the managed cache.`, { executablePath: override, source: "override" });
    }
    try {
      await this.dependencies.fileSystem.mkdir(dirname(cachePath), { recursive: true });
    } catch (error) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_REMOVAL_FAILED", `Could not prepare managed '${id}' cache for removal: ${errorMessage(error)}`, { cachePath });
    }
    const removeLock = await this.acquireLock(`${cachePath}.lock`);
    try {
      const removed = await exists(this.dependencies.fileSystem, cachePath);
      await this.dependencies.fileSystem.rm(cachePath, { force: true, recursive: true });
      return { cachePath, code: "TN_EXTERNAL_TOOL_REMOVED", id, removed, version: definition.version };
    } catch (error) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_REMOVAL_FAILED", `Could not remove managed '${id}' cache entry '${cachePath}': ${errorMessage(error)}`, { cachePath });
    } finally {
      await removeLock.release();
    }
  }

  private resolveDefinition(idInput: string): { artifact: IExternalToolArtifact; definition: IExternalToolDefinition; id: ExternalToolId } {
    const definition = this.dependencies.resolveDefinition(idInput);
    if (definition === undefined) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_MISSING", `Unknown external tool '${idInput}'. Supported tools: blender.`, { tool: idInput });
    }
    const host = externalToolHost(this.dependencies.platform, this.dependencies.arch);
    if (host === undefined) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_UNSUPPORTED_HOST", `'${definition.id}' is not supported on ${this.dependencies.platform}-${this.dependencies.arch}.`, { arch: this.dependencies.arch, platform: this.dependencies.platform });
    }
    return { artifact: definition.artifacts[host], definition, id: definition.id };
  }

  private cachePath(id: ExternalToolId, version: string, host: ExternalToolHost): string {
    const root = this.dependencies.env.THREENATIVE_TOOL_CACHE?.trim() || defaultCacheRoot(this.dependencies.platform, this.dependencies.env, this.dependencies.homeDirectory);
    return join(root, id, version, host);
  }

  private async probe(executablePath: string, definition: IExternalToolDefinition): Promise<string> {
    let result: IProcessResult;
    try {
      result = await this.dependencies.runProcess(executablePath, definition.versionProbe.args, { timeoutMs: 30_000 });
    } catch (error) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_PROBE_FAILED", `Could not execute version probe for '${executablePath}': ${errorMessage(error)}`, { executablePath });
    }
    if (result.timedOut) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_TIMEOUT", `Version probe timed out for '${executablePath}'.`, { executablePath });
    }
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (result.exitCode !== 0 || !definition.versionProbe.outputPattern.test(output)) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_PROBE_FAILED", `Executable '${executablePath}' did not report supported ${definition.id} ${definition.version}.`, { executablePath, output: output.slice(0, 4096) });
    }
    return output.split("\n", 1)[0] ?? output;
  }

  private readyStatus(definition: IExternalToolDefinition, artifact: IExternalToolArtifact, cachePath: string, executablePath: string, source: "managed" | "override", versionOutput: string): IExternalToolStatus {
    return { artifact, cachePath, code: "TN_EXTERNAL_TOOL_READY", executablePath, id: definition.id, license: definition.license, ready: true, source, sourceUrl: definition.sourceUrl, version: definition.version, versionOutput };
  }

  private missingStatus(definition: IExternalToolDefinition, artifact: IExternalToolArtifact): IExternalToolStatus {
    const cachePath = this.cachePath(definition.id, definition.version, artifact.host);
    return {
      artifact,
      cachePath,
      code: "TN_EXTERNAL_TOOL_MISSING",
      executablePath: join(cachePath, artifact.executablePath),
      id: definition.id,
      license: definition.license,
      ready: false,
      source: "missing",
      sourceUrl: definition.sourceUrl,
      version: definition.version,
    };
  }

  private installDisclosure(definition: IExternalToolDefinition, artifact: IExternalToolArtifact, destination: string, freeSpaceEstimate: number): Record<string, unknown> {
    return { destination, downloadBytes: artifact.expectedBytes, freeSpaceEstimate, license: definition.license, sha256: artifact.sha256, sourceUrl: definition.sourceUrl, url: artifact.url, version: definition.version };
  }

  private async availableBytes(path: string): Promise<number> {
    try {
      const value = await this.dependencies.fileSystem.statfs(path);
      return Number(value.bavail) * Number(value.bsize);
    } catch (error) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_DISK_SPACE", `Could not determine free space at '${path}': ${errorMessage(error)}`, { path });
    }
  }

  private async installFileSystemOperation<T>(operation: () => Promise<T>, message: string, details: Record<string, unknown>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_INSTALL_FAILED", `${message} ${errorMessage(error)}`, details);
    }
  }

  private async cleanupStaging(parent: string, prefix: string): Promise<void> {
    try {
      const entries = await this.dependencies.fileSystem.readdir(parent);
      for (const entry of entries.filter((value) => value.startsWith(prefix))) {
        const path = join(parent, entry);
        const entryStat = await this.dependencies.fileSystem.stat(path);
        if (this.dependencies.now() - entryStat.mtimeMs >= this.dependencies.timeoutMs) {
          await this.dependencies.fileSystem.rm(path, { force: true, recursive: true });
        }
      }
    } catch (error) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_STALE_STAGING_FAILED", `Could not clean stale external-tool staging: ${errorMessage(error)}`, { parent });
    }
  }

  private async acquireLock(lockPath: string): Promise<IExternalToolLock> {
    const started = this.dependencies.now();
    const ownerName = `.owner-${this.dependencies.uniqueId()}`;
    const ownerPath = join(lockPath, ownerName);
    while (true) {
      try {
        await this.dependencies.fileSystem.mkdir(lockPath);
        try {
          await this.dependencies.fileSystem.mkdir(ownerPath);
        } catch (error) {
          await this.dependencies.fileSystem.rm(lockPath, { force: true, recursive: true }).catch(() => undefined);
          throw error;
        }
        const assertOwned = async (): Promise<void> => {
          try {
            await this.dependencies.fileSystem.access(ownerPath);
          } catch (error) {
            throw new ExternalToolError("TN_EXTERNAL_TOOL_LOCK_CONTENTION", `Lost ownership of install lock '${lockPath}': ${errorMessage(error)}`, { lockPath, owner: ownerName });
          }
        };
        return {
          assertOwned,
          release: async () => {
            await assertOwned();
            try {
              await this.dependencies.fileSystem.rm(lockPath, { force: true, recursive: true });
            } catch (error) {
              throw new ExternalToolError("TN_EXTERNAL_TOOL_LOCK_CONTENTION", `Could not release owned install lock '${lockPath}': ${errorMessage(error)}`, { lockPath, owner: ownerName });
            }
          },
        };
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) {
          throw new ExternalToolError("TN_EXTERNAL_TOOL_LOCK_CONTENTION", `Could not acquire install lock '${lockPath}': ${errorMessage(error)}`, { lockPath });
        }
        if (this.dependencies.now() - started >= this.dependencies.lockTimeoutMs) {
          throw new ExternalToolError("TN_EXTERNAL_TOOL_LOCK_CONTENTION", `Timed out waiting for install lock '${lockPath}'.`, { lockPath });
        }
        try {
          const lockStat = await this.dependencies.fileSystem.stat(lockPath);
          if (this.dependencies.now() - lockStat.mtimeMs >= this.dependencies.lockStaleMs) {
            const observedOwners = (await this.dependencies.fileSystem.readdir(lockPath)).filter((entry) => entry.startsWith(".owner-")).sort();
            const confirmedStat = await this.dependencies.fileSystem.stat(lockPath);
            const confirmedOwners = (await this.dependencies.fileSystem.readdir(lockPath)).filter((entry) => entry.startsWith(".owner-")).sort();
            if (confirmedStat.mtimeMs !== lockStat.mtimeMs || !sameStrings(observedOwners, confirmedOwners)) {
              await this.dependencies.sleep(25);
              continue;
            }
            await this.dependencies.fileSystem.rm(lockPath, { force: true, recursive: true });
            continue;
          }
        } catch (statError) {
          if (!isNodeError(statError, "ENOENT")) {
            throw new ExternalToolError("TN_EXTERNAL_TOOL_LOCK_CONTENTION", `Could not inspect install lock '${lockPath}': ${errorMessage(statError)}`, { lockPath });
          }
        }
        await this.dependencies.sleep(25);
      }
    }
  }

  private async download(artifact: IExternalToolArtifact, destination: string): Promise<IDownloadResult> {
    const started = this.dependencies.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.dependencies.timeoutMs);
    try {
      const response = await this.dependencies.fetch(artifact.url, { redirect: "follow", signal: controller.signal });
      if (!response.ok || response.body === null) {
        throw new ExternalToolError("TN_EXTERNAL_TOOL_HTTP_FAILED", `Download failed for '${artifact.url}' with HTTP ${response.status}.`, { status: response.status, url: artifact.url });
      }
      const declaredSize = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredSize) && declaredSize > artifact.expectedBytes) {
        throw new ExternalToolError("TN_EXTERNAL_TOOL_HTTP_FAILED", `Download for '${artifact.archiveFile}' exceeds the pinned maximum size.`, { declaredSize, maximumBytes: artifact.expectedBytes });
      }
      let bytes = 0;
      const hash = createHash("sha256");
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > artifact.expectedBytes) {
            callback(new ExternalToolError("TN_EXTERNAL_TOOL_HTTP_FAILED", `Download for '${artifact.archiveFile}' exceeds the pinned maximum size.`, { maximumBytes: artifact.expectedBytes }));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(response.body), meter, this.dependencies.fileSystem.createWriteStream(destination));
      return { bytes, milliseconds: Math.max(0, this.dependencies.now() - started), sha256: hash.digest("hex") };
    } catch (error) {
      if (error instanceof ExternalToolError) throw error;
      if (controller.signal.aborted) {
        throw new ExternalToolError("TN_EXTERNAL_TOOL_TIMEOUT", `Download timed out for '${artifact.url}'.`, { url: artifact.url });
      }
      throw new ExternalToolError("TN_EXTERNAL_TOOL_HTTP_FAILED", `Download failed for '${artifact.url}': ${errorMessage(error)}`, { url: artifact.url });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createExternalToolManager(dependencies: Partial<IExternalToolManagerDependencies> = {}): ExternalToolManager {
  return new ExternalToolManager(dependencies);
}

function defaultCacheRoot(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string {
  if (platform === "win32") return join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "ThreeNative", "tools");
  if (platform === "darwin") return join(home, "Library", "Caches", "ThreeNative", "tools");
  return join(env.XDG_CACHE_HOME || join(home, ".cache"), "threenative", "tools");
}

async function exists(fileSystem: IExternalToolFileSystem, path: string): Promise<boolean> {
  try {
    await fileSystem.access(path);
    return true;
  } catch {
    return false;
  }
}

const ARCHIVE_MANIFEST_MAX_BYTES = 16 * 1024 * 1024;

export async function extractOfficialArtifact(artifact: IExternalToolArtifact, archivePath: string, destination: string, dependencies: Pick<IExternalToolManagerDependencies, "fileSystem" | "runProcess">): Promise<void> {
  if (artifact.archive === "tar.xz" || artifact.archive === "zip") {
    const listing = await dependencies.runProcess("tar", ["-tf", archivePath], { maxOutputBytes: ARCHIVE_MANIFEST_MAX_BYTES, timeoutMs: 120_000 });
    assertProcessSucceeded(listing, `inspect ${artifact.archiveFile}`);
    assertCompleteArchiveManifest(listing, artifact.archiveFile);
    validateArchiveEntries(listing.stdout);
    const verboseListing = await dependencies.runProcess("tar", ["-tvf", archivePath], { maxOutputBytes: ARCHIVE_MANIFEST_MAX_BYTES, timeoutMs: 120_000 });
    assertProcessSucceeded(verboseListing, `inspect links in ${artifact.archiveFile}`);
    assertCompleteArchiveManifest(verboseListing, artifact.archiveFile);
    validateArchiveLinkTargets(verboseListing.stdout);
    const result = await dependencies.runProcess("tar", ["-xf", archivePath, "-C", destination], { timeoutMs: 10 * 60_000 });
    assertProcessSucceeded(result, `extract ${artifact.archiveFile}`);
    await assertExtractedTreeContained(destination);
    return;
  }
  const mountPath = `${destination}.mount`;
  await dependencies.fileSystem.mkdir(mountPath, { recursive: true });
  const attach = await dependencies.runProcess("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mountPath, archivePath], { timeoutMs: 120_000 });
  assertProcessSucceeded(attach, `attach ${artifact.archiveFile}`);
  try {
    await dependencies.fileSystem.copy(join(mountPath, "Blender.app"), join(destination, "Blender.app"), { recursive: true });
  } finally {
    let detach = await dependencies.runProcess("hdiutil", ["detach", mountPath], { timeoutMs: 120_000 });
    if (detach.exitCode !== 0 || detach.timedOut) {
      detach = await dependencies.runProcess("hdiutil", ["detach", "-force", mountPath], { timeoutMs: 120_000 });
    }
    assertProcessSucceeded(detach, `detach ${artifact.archiveFile}`);
    await dependencies.fileSystem.rm(mountPath, { force: true, recursive: true });
  }
}

export function validateArchiveEntries(listing: string): void {
  for (const rawEntry of listing.split(/\r?\n/u)) {
    const entry = rawEntry.trim().replaceAll("\\", "/");
    if (entry === "") continue;
    const segments = entry.split("/").filter((segment) => segment !== "" && segment !== ".");
    if (isAbsolute(entry) || /^\/?[A-Za-z]:\//u.test(entry) || entry.startsWith("/") || segments.includes("..")) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Archive entry '${rawEntry}' escapes the extraction directory.`, { entry: rawEntry });
    }
  }
}

export function validateArchiveLinkTargets(verboseListing: string): void {
  for (const rawLine of verboseListing.split(/\r?\n/u)) {
    const separator = rawLine.includes(" link to ") ? " link to " : rawLine.includes(" -> ") ? " -> " : undefined;
    if (separator === undefined) continue;
    const target = rawLine.slice(rawLine.lastIndexOf(separator) + separator.length).trim().replaceAll("\\", "/");
    const segments = target.split("/").filter((segment) => segment !== "" && segment !== ".");
    if (target === "" || isAbsolute(target) || /^\/?[A-Za-z]:\//u.test(target) || target.startsWith("/") || segments.includes("..")) {
      throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Archive link target '${target}' can escape the extraction directory.`, { target });
    }
  }
}

function assertCompleteArchiveManifest(result: IProcessResult, archiveFile: string): void {
  if (result.outputTruncated === true) {
    throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Archive manifest for '${archiveFile}' exceeds ${ARCHIVE_MANIFEST_MAX_BYTES} bytes.`, { archiveFile, maximumBytes: ARCHIVE_MANIFEST_MAX_BYTES });
  }
}

async function assertExtractedTreeContained(root: string): Promise<void> {
  const resolvedRoot = await realpath(root);
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory)) {
      const path = resolve(directory, entry);
      const pathRelative = relative(resolvedRoot, path);
      if (pathRelative === ".." || pathRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
        throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Extracted path '${path}' escapes '${resolvedRoot}'.`, { path });
      }
      const value = await lstat(path);
      if (value.isSymbolicLink()) {
        const target = await realpath(path);
        const targetRelative = relative(resolvedRoot, target);
        if (targetRelative === ".." || targetRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
          throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Extracted symlink '${path}' targets outside '${resolvedRoot}'.`, { path, target });
        }
      } else if (value.isDirectory()) {
        await visit(path);
      } else if (!value.isFile()) {
        throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Archive created unsupported filesystem entry '${path}'.`, { path });
      }
    }
  };
  await visit(resolvedRoot);
}

function assertProcessSucceeded(result: IProcessResult, action: string): void {
  if (result.timedOut) throw new ExternalToolError("TN_EXTERNAL_TOOL_TIMEOUT", `Timed out while trying to ${action}.`);
  if (result.exitCode !== 0) throw new ExternalToolError("TN_EXTERNAL_TOOL_EXTRACTION_FAILED", `Could not ${action}: ${result.stderr || result.stdout}`);
}

export async function runBoundedProcess(executable: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; maxOutputBytes?: number; platform?: NodeJS.Platform; timeoutMs: number }): Promise<IProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { cwd: options.cwd, detached: process.platform !== "win32", env: options.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputTruncated = false;
    let peakMemoryBytes = 0;
    let memorySample = Promise.resolve();
    let settled = false;
    const platform = options.platform ?? process.platform;
    const maximumOutputBytes = options.maxOutputBytes ?? 128 * 1024;
    const append = (current: string, chunk: Buffer): string => {
      const combined = `${current}${chunk.toString("utf8")}`;
      if (Buffer.byteLength(combined, "utf8") <= maximumOutputBytes) return combined;
      outputTruncated = true;
      return Buffer.from(combined, "utf8").subarray(-maximumOutputBytes).toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const sampleMemory = (): void => {
      if (child.pid === undefined) return;
      memorySample = memorySample.then(async () => {
        const bytes = await processRssBytes(child.pid!, platform);
        peakMemoryBytes = Math.max(peakMemoryBytes, bytes ?? 0);
      });
    };
    sampleMemory();
    const memoryTimer = setInterval(sampleMemory, 25);
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(memoryTimer);
      void memorySample.finally(() => resolve({ exitCode, outputTruncated, ...(peakMemoryBytes > 0 ? { peakMemoryBytes } : {}), stderr, stdout, timedOut }));
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child, platform).finally(() => {
        setTimeout(() => finish(null), 1_000);
      });
    }, options.timeoutMs);
    child.once("error", (error) => {
      if (timedOut) finish(null);
      else if (!settled) { settled = true; clearTimeout(timer); clearInterval(memoryTimer); reject(error); }
    });
    child.once("close", finish);
  });
}

async function processRssBytes(pid: number, platform: NodeJS.Platform): Promise<number | undefined> {
  if (platform === "linux") {
    try {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      const match = /^VmRSS:\s+(\d+)\s+kB$/mu.exec(status);
      return match === null ? undefined : Number(match[1]) * 1024;
    } catch {
      return undefined;
    }
  }
  const command = platform === "darwin"
    ? { executable: "ps", args: ["-o", "rss=", "-p", String(pid)] }
    : { executable: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`] };
  return new Promise((resolveRss) => {
    const probe = spawn(command.executable, command.args, { shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    probe.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    probe.once("error", () => resolveRss(undefined));
    probe.once("close", () => {
      const value = Number(output.trim());
      resolveRss(Number.isFinite(value) && value > 0 ? value * (platform === "darwin" ? 1024 : 1) : undefined);
    });
  });
}

async function terminateProcessTree(child: ChildProcess, platform: NodeJS.Platform): Promise<void> {
  if (child.pid === undefined) {
    child.kill("SIGKILL");
    return;
  }
  if (platform !== "win32") {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    return;
  }
  const taskkillSucceeded = await new Promise<boolean>((resolveTaskkill) => {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { shell: false, stdio: "ignore" });
    let finished = false;
    const finishTaskkill = (succeeded: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(killerTimeout);
      resolveTaskkill(succeeded);
    };
    const killerTimeout = setTimeout(() => {
      killer.kill("SIGKILL");
      finishTaskkill(false);
    }, 5_000);
    killer.once("error", () => finishTaskkill(false));
    killer.once("close", (exitCode) => finishTaskkill(exitCode === 0));
  });
  if (!taskkillSucceeded || child.exitCode === null) child.kill("SIGKILL");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isRepairableProbeFailure(error: unknown): error is ExternalToolError {
  return error instanceof ExternalToolError && (error.code === "TN_EXTERNAL_TOOL_PROBE_FAILED" || error.code === "TN_EXTERNAL_TOOL_TIMEOUT");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
