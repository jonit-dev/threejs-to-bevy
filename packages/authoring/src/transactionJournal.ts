import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  lstat,
  open,
  readFile,
  readdir,
  rename,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { hostname } from "node:os";

import { authoringDiagnostic, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";

const JOURNAL_SCHEMA = "threenative.authoring-transaction";
const JOURNAL_VERSION = "0.1.0";
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 10;

export type AuthoringTransactionHash = `sha256:${string}`;

export interface IAuthoringTransactionFile {
  baseHash: AuthoringTransactionHash | null;
  bytes: Uint8Array | null;
  path: string;
}

export interface IAuthoringTransactionFaultInjection {
  afterTransition: number;
  mode: "error" | "interrupt";
}

export interface IPublishAuthoringTransactionOptions {
  faultInjection?: IAuthoringTransactionFaultInjection;
  files: readonly IAuthoringTransactionFile[];
  lockTimeoutMs?: number;
  projectPath: string;
  staleLockMs?: number;
  transactionId?: string;
}

export interface IRecoverAuthoringTransactionsOptions {
  lockTimeoutMs?: number;
  projectPath: string;
  staleLockMs?: number;
}

export interface IAuthoringTransactionResult {
  committed: boolean;
  diagnostics: IAuthoringDiagnostic[];
  filesWritten: string[];
  ok: boolean;
  recovered: boolean;
  transactionId: string;
}

interface IJournalEntry {
  backupPath: string;
  baseHash: AuthoringTransactionHash | null;
  nextHash: AuthoringTransactionHash | null;
  path: string;
  stagePath: string;
}

interface ITransactionJournal {
  entries: IJournalEntry[];
  schema: typeof JOURNAL_SCHEMA;
  state: "prepared" | "publishing" | "committed";
  transactionId: string;
  version: typeof JOURNAL_VERSION;
}

interface IRecoveryScanResult {
  diagnostics: IAuthoringDiagnostic[];
  recovered: boolean;
}

class InjectedAuthoringTransactionInterruption extends Error {}

export function hashAuthoringTransactionBytes(bytes: Uint8Array): AuthoringTransactionHash {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function publishAuthoringTransaction(
  options: IPublishAuthoringTransactionOptions,
): Promise<IAuthoringTransactionResult> {
  const projectPath = resolve(options.projectPath);
  const transactionId = options.transactionId ?? `authoring-${randomUUID()}`;
  const inputDiagnostic = validateInput(projectPath, transactionId, options.files);
  if (inputDiagnostic !== undefined) return failedResult(transactionId, [inputDiagnostic], false);

  const lock = await acquireProjectLock(projectPath, options.lockTimeoutMs, options.staleLockMs);
  if (lock.diagnostic !== undefined) return failedResult(transactionId, [lock.diagnostic], false);

  let recovered = false;
  try {
    const recovery = await recoverUnderLock(projectPath);
    if (recovery.diagnostics.length > 0) return failedResult(transactionId, recovery.diagnostics, recovery.recovered);
    recovered = recovery.recovered;
    const filesystemDiagnostics = await validateFilesystemTargets(projectPath, options.files);
    if (filesystemDiagnostics.length > 0) return failedResult(transactionId, filesystemDiagnostics, recovered);
    const conflicts = await verifyBaseHashes(projectPath, options.files);
    if (conflicts.length > 0) return failedResult(transactionId, conflicts, recovered);

    let journal: ITransactionJournal | undefined;
    let transition = 0;
    const inject = (): void => {
      transition += 1;
      if (options.faultInjection?.afterTransition !== transition) return;
      if (options.faultInjection.mode === "interrupt") {
        throw new InjectedAuthoringTransactionInterruption("Injected authoring transaction interruption.");
      }
      throw new Error("Injected authoring transaction promotion failure.");
    };

    try {
      journal = await prepareJournal(projectPath, transactionId, options.files);
      inject();
      journal.state = "publishing";
      await persistJournal(projectPath, journal);
      inject();
      for (const entry of journal.entries) {
        if (entry.baseHash === null) continue;
        await mkdir(dirname(resolve(projectPath, entry.backupPath)), { recursive: true });
        await rename(resolve(projectPath, entry.path), resolve(projectPath, entry.backupPath));
        inject();
      }
      for (const entry of journal.entries) {
        if (entry.nextHash === null) continue;
        await mkdir(dirname(resolve(projectPath, entry.path)), { recursive: true });
        await rename(resolve(projectPath, entry.stagePath), resolve(projectPath, entry.path));
        inject();
      }
      journal.state = "committed";
      await persistJournal(projectPath, journal);
      inject();
      await cleanupTransaction(projectPath, transactionId);
      inject();
      return committedResult(journal, recovered);
    } catch (error) {
      if (error instanceof InjectedAuthoringTransactionInterruption) throw error;
      if (journal?.state === "committed") {
        return committedResult(journal, recovered, [authoringDiagnostic({
          code: "TN_AUTHORING_TRANSACTION_CLEANUP_DEFERRED",
          message: "The authoring transaction committed, but cleanup was deferred to the next authoring mutation.",
          severity: "warning",
          suggestion: "No source repair is needed; the next authoring command will remove the committed journal.",
          value: { error: errorMessage(error) },
        })]);
      }
      if (journal === undefined) {
        await cleanupTransaction(projectPath, transactionId);
        return failedResult(transactionId, [publishFailedDiagnostic(error)], recovered);
      }
      try {
        await rollBackJournal(projectPath, journal);
      } catch (rollbackError) {
        return failedResult(transactionId, [
          publishFailedDiagnostic(error),
          recoveryFailedDiagnostic(transactionId, rollbackError),
        ], recovered);
      }
      const rollbackDiagnostics = await verifyRecoveredState(projectPath, journal, "old");
      if (rollbackDiagnostics.length > 0) {
        return failedResult(transactionId, [publishFailedDiagnostic(error), ...rollbackDiagnostics], recovered);
      }
      await cleanupTransaction(projectPath, transactionId);
      return failedResult(transactionId, [publishFailedDiagnostic(error)], recovered);
    }
  } finally {
    await lock.release();
  }
}

export async function recoverAuthoringTransactions(
  options: IRecoverAuthoringTransactionsOptions,
): Promise<IAuthoringTransactionResult> {
  const projectPath = resolve(options.projectPath);
  const transactionId = `recovery-${randomUUID()}`;
  const lock = await acquireProjectLock(projectPath, options.lockTimeoutMs, options.staleLockMs);
  if (lock.diagnostic !== undefined) return failedResult(transactionId, [lock.diagnostic], false);
  try {
    const recovery = await recoverUnderLock(projectPath);
    if (recovery.diagnostics.length > 0) return failedResult(transactionId, recovery.diagnostics, recovery.recovered);
    return { committed: false, diagnostics: [], filesWritten: [], ok: true, recovered: recovery.recovered, transactionId };
  } finally {
    await lock.release();
  }
}

async function acquireProjectLock(
  projectPath: string,
  lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  staleLockMs = DEFAULT_STALE_LOCK_MS,
): Promise<{ diagnostic?: IAuthoringDiagnostic; release: () => Promise<void> }> {
  const lockPath = resolve(projectPath, ".tn/authoring.lock");
  const deadline = Date.now() + Math.max(0, lockTimeoutMs);
  await mkdir(resolve(projectPath, ".tn"), { recursive: true });
  for (;;) {
    const token = randomUUID();
    try {
      await mkdir(lockPath);
      await writeFile(resolve(lockPath, "owner.json"), `${JSON.stringify({ acquiredAt: Date.now(), hostname: hostname(), pid: process.pid, token })}\n`, "utf8");
      return { release: async () => releaseProjectLock(lockPath, token) };
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      if (await isStaleLock(lockPath, staleLockMs)) {
        const quarantine = `${lockPath}.stale-${randomUUID()}`;
        try {
          await rename(lockPath, quarantine);
          await rm(quarantine, { force: true, recursive: true });
        } catch (takeoverError) {
          if (!isNodeError(takeoverError, "ENOENT")) throw takeoverError;
        }
        continue;
      }
      if (Date.now() >= deadline) {
        return {
          diagnostic: authoringDiagnostic({
            code: "TN_AUTHORING_PROJECT_LOCKED",
            message: "Another authoring transaction holds the project publish lock.",
            path: ".tn/authoring.lock",
            suggestion: "Wait for the other authoring command to finish, then re-plan and apply.",
          }),
          release: async () => undefined,
        };
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, LOCK_RETRY_MS));
    }
  }
}

async function isStaleLock(lockPath: string, staleLockMs: number): Promise<boolean> {
  try {
    const raw = JSON.parse(await readFile(resolve(lockPath, "owner.json"), "utf8")) as { acquiredAt?: unknown; hostname?: unknown; pid?: unknown };
    const acquiredAt = typeof raw.acquiredAt === "number" ? raw.acquiredAt : 0;
    if (Date.now() - acquiredAt < staleLockMs) return false;
    if (raw.hostname !== hostname()) return true;
    if (typeof raw.pid !== "number") return true;
    try {
      process.kill(raw.pid, 0);
      return false;
    } catch (error) {
      return isNodeError(error, "ESRCH");
    }
  } catch {
    try {
      return Date.now() - (await stat(lockPath)).mtimeMs >= staleLockMs;
    } catch {
      return false;
    }
  }
}

async function releaseProjectLock(lockPath: string, token: string): Promise<void> {
  try {
    const owner = JSON.parse(await readFile(resolve(lockPath, "owner.json"), "utf8")) as { token?: unknown };
    if (owner.token !== token) return;
    const quarantine = `${lockPath}.release-${token}`;
    await rename(lockPath, quarantine);
    await rm(quarantine, { force: true, recursive: true });
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

async function prepareJournal(
  projectPath: string,
  transactionId: string,
  files: readonly IAuthoringTransactionFile[],
): Promise<ITransactionJournal> {
  const root = transactionRoot(transactionId);
  const entries: IJournalEntry[] = files.map((file, index) => ({
    backupPath: `${root}/backup/${index}.bin`,
    baseHash: file.baseHash,
    nextHash: file.bytes === null ? null : hashAuthoringTransactionBytes(file.bytes),
    path: normalizePath(file.path),
    stagePath: `${root}/stage/${index}.bin`,
  }));
  await mkdir(resolve(projectPath, root, "stage"), { recursive: true });
  await mkdir(resolve(projectPath, root, "backup"), { recursive: true });
  for (let index = 0; index < files.length; index += 1) {
    const bytes = files[index]?.bytes;
    if (bytes === null || bytes === undefined) continue;
    await writeDurably(resolve(projectPath, entries[index]!.stagePath), bytes);
  }
  const journal: ITransactionJournal = { entries, schema: JOURNAL_SCHEMA, state: "prepared", transactionId, version: JOURNAL_VERSION };
  await persistJournal(projectPath, journal);
  return journal;
}

async function persistJournal(projectPath: string, journal: ITransactionJournal): Promise<void> {
  const path = resolve(projectPath, transactionRoot(journal.transactionId), "journal.json");
  const temporaryPath = `${path}.tmp`;
  await writeDurably(temporaryPath, Buffer.from(`${JSON.stringify(journal, null, 2)}\n`));
  await rename(temporaryPath, path);
}

async function writeDurably(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "w");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function recoverUnderLock(projectPath: string): Promise<IRecoveryScanResult> {
  const transactionsPath = resolve(projectPath, ".tn/authoring-transactions");
  let names: string[];
  try {
    names = (await readdir(transactionsPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return { diagnostics: [], recovered: false };
    throw error;
  }
  const journals: ITransactionJournal[] = [];
  const diagnostics: IAuthoringDiagnostic[] = [];
  for (const name of names) {
    const journal = await readJournal(projectPath, name);
    if (journal === undefined) {
      diagnostics.push(authoringDiagnostic({
        code: "TN_AUTHORING_TRANSACTION_RECOVERY_FAILED",
        file: `${transactionRoot(name)}/journal.json`,
        message: `Authoring transaction '${name}' has a missing, corrupt, or unsupported recovery journal.`,
        suggestion: "Preserve the transaction directory and repair or remove it only after verifying the durable source files.",
      }));
      continue;
    }
    journals.push(journal);
  }
  if (diagnostics.length > 0) return { diagnostics: sortAuthoringDiagnostics(diagnostics), recovered: false };
  let recovered = false;
  for (const journal of journals) {
    const expectedState = journal.state === "committed" ? "new" : "old";
    if (journal.state !== "committed") await rollBackJournal(projectPath, journal);
    const stateDiagnostics = await verifyRecoveredState(projectPath, journal, expectedState);
    if (stateDiagnostics.length > 0) {
      return { diagnostics: stateDiagnostics, recovered };
    }
    await cleanupTransaction(projectPath, journal.transactionId);
    recovered = true;
  }
  return { diagnostics: [], recovered };
}

async function verifyRecoveredState(
  projectPath: string,
  journal: ITransactionJournal,
  expectedState: "new" | "old",
): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  for (const entry of journal.entries) {
    const expectedHash = expectedState === "new" ? entry.nextHash : entry.baseHash;
    const actualHash = await hashFile(resolve(projectPath, entry.path));
    if (actualHash === expectedHash) continue;
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_TRANSACTION_RECOVERY_FAILED",
      file: entry.path,
      message: `Authoring transaction '${journal.transactionId}' could not recover a complete ${expectedState} file set.`,
      suggestion: "Preserve the transaction directory and repair the source file from its stage or backup artifact.",
      value: { actualHash, expectedHash, state: expectedState, transactionId: journal.transactionId },
    }));
  }
  return sortAuthoringDiagnostics(diagnostics);
}

async function readJournal(projectPath: string, transactionId: string): Promise<ITransactionJournal | undefined> {
  try {
    const value = JSON.parse(await readFile(resolve(projectPath, transactionRoot(transactionId), "journal.json"), "utf8")) as Partial<ITransactionJournal>;
    if (
      value.schema !== JOURNAL_SCHEMA ||
      value.version !== JOURNAL_VERSION ||
      value.transactionId !== transactionId ||
      !Array.isArray(value.entries) ||
      !["prepared", "publishing", "committed"].includes(value.state ?? "")
    ) return undefined;
    if (value.entries.some((entry) => !isJournalEntry(entry, transactionId))) return undefined;
    if (new Set(value.entries.map((entry) => entry.path)).size !== value.entries.length) return undefined;
    return value as ITransactionJournal;
  } catch {
    return undefined;
  }
}

async function rollBackJournal(projectPath: string, journal: ITransactionJournal): Promise<void> {
  for (const entry of [...journal.entries].reverse()) {
    const target = resolve(projectPath, entry.path);
    const backup = resolve(projectPath, entry.backupPath);
    if (entry.baseHash === null) {
      await unlink(target).catch(ignoreMissing);
      continue;
    }
    if (await exists(backup)) {
      await unlink(target).catch(ignoreMissing);
      await mkdir(dirname(target), { recursive: true });
      await rename(backup, target);
    }
  }
}

async function verifyBaseHashes(
  projectPath: string,
  files: readonly IAuthoringTransactionFile[],
): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    const actualHash = await hashFile(resolve(projectPath, path));
    if (actualHash === file.baseHash) continue;
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_BATCH_CONFLICT",
      file: path,
      message: `Authoring source '${path}' changed after the batch was planned.`,
      suggestion: "Run authoring batch plan again and review the new base before applying.",
      value: { actualHash, expectedHash: file.baseHash, path },
    }));
  }
  return sortAuthoringDiagnostics(diagnostics);
}

async function validateFilesystemTargets(
  projectPath: string,
  files: readonly IAuthoringTransactionFile[],
): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  const [projectRealPath, transactionDevice] = await Promise.all([
    realpath(projectPath),
    stat(resolve(projectPath, ".tn")).then((value) => value.dev),
  ]);
  for (const file of files) {
    const path = normalizePath(file.path);
    const target = resolve(projectPath, path);
    try {
      const targetStat = await lstat(target);
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
        diagnostics.push(authoringDiagnostic({
          code: "TN_AUTHORING_TRANSACTION_PATH_INVALID",
          file: path,
          message: `Authoring transaction target '${path}' must be a regular project-local file.`,
          suggestion: "Replace symbolic links and non-file targets with durable project source files.",
        }));
        continue;
      }
      const targetRealPath = await realpath(target);
      const relativeTarget = relative(projectRealPath, targetRealPath);
      if (relativeTarget === ".." || relativeTarget.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
        diagnostics.push(authoringDiagnostic({
          code: "TN_AUTHORING_TRANSACTION_PATH_INVALID",
          file: path,
          message: `Authoring transaction target '${path}' escapes the project through its parent path.`,
          suggestion: "Use a real project-local directory rather than a symbolic-link escape.",
        }));
      } else if (targetStat.dev !== transactionDevice) diagnostics.push(crossDeviceDiagnostic(path));
      continue;
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
    const parent = await nearestExistingParent(dirname(target));
    const [parentRealPath, parentStat] = await Promise.all([realpath(parent), stat(parent)]);
    const relativeParent = relative(projectRealPath, parentRealPath);
    if (relativeParent === ".." || relativeParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
      diagnostics.push(authoringDiagnostic({
        code: "TN_AUTHORING_TRANSACTION_PATH_INVALID",
        file: path,
        message: `Authoring transaction target '${path}' escapes the project through its parent path.`,
        suggestion: "Use a real project-local directory rather than a symbolic-link escape.",
      }));
    } else if (parentStat.dev !== transactionDevice) {
      diagnostics.push(crossDeviceDiagnostic(path));
    }
  }
  return sortAuthoringDiagnostics(diagnostics);
}

async function nearestExistingParent(path: string): Promise<string> {
  let candidate = path;
  for (;;) {
    try {
      await lstat(candidate);
      return candidate;
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

function crossDeviceDiagnostic(path: string): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_TRANSACTION_CROSS_DEVICE",
    file: path,
    message: `Authoring transaction target '${path}' is not on the transaction journal filesystem.`,
    suggestion: "Keep durable authoring source and the project-local .tn directory on the same filesystem.",
  });
}

async function hashFile(path: string): Promise<AuthoringTransactionHash | null> {
  try {
    return hashAuthoringTransactionBytes(await readFile(path));
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  }
}

function validateInput(
  projectPath: string,
  transactionId: string,
  files: readonly IAuthoringTransactionFile[],
): IAuthoringDiagnostic | undefined {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(transactionId)) {
    return authoringDiagnostic({
      code: "TN_AUTHORING_TRANSACTION_ID_INVALID",
      message: "Authoring transaction IDs may contain only letters, numbers, dots, underscores, and hyphens.",
      path: "/transactionId",
      suggestion: "Use an opaque normalized transaction ID without path separators.",
    });
  }
  const seen = new Set<string>();
  for (const file of files) {
    const path = normalizePath(file.path);
    if (file.baseHash !== null && !isTransactionHash(file.baseHash)) {
      return authoringDiagnostic({
        code: "TN_AUTHORING_TRANSACTION_HASH_INVALID",
        file: path,
        message: `Authoring transaction base hash for '${path}' is not an exact SHA-256 value.`,
        suggestion: "Plan the transaction again and pass its complete sha256-prefixed base hash.",
      });
    }
    const absolute = resolve(projectPath, path);
    if (path === "" || path.startsWith("../") || relative(projectPath, absolute).startsWith("..") || path === ".tn" || path.startsWith(".tn/")) {
      return authoringDiagnostic({
        code: "TN_AUTHORING_TRANSACTION_PATH_INVALID",
        file: file.path,
        message: "Authoring transaction paths must stay inside the project and outside transaction artifacts.",
        suggestion: "Use a normalized project-relative durable source path.",
      });
    }
    if (seen.has(path)) {
      return authoringDiagnostic({
        code: "TN_AUTHORING_TRANSACTION_PATH_DUPLICATE",
        file: path,
        message: `Authoring transaction path '${path}' appears more than once.`,
        suggestion: "Combine each path into one final byte payload before publishing.",
      });
    }
    seen.add(path);
  }
  return undefined;
}

function isJournalEntry(value: unknown, transactionId: string): value is IJournalEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<IJournalEntry>;
  const root = `${transactionRoot(transactionId)}/`;
  return typeof entry.path === "string" && isSafeJournalTarget(entry.path) &&
    typeof entry.backupPath === "string" && isIndexedArtifactPath(entry.backupPath, `${root}backup/`) &&
    typeof entry.stagePath === "string" && isIndexedArtifactPath(entry.stagePath, `${root}stage/`) &&
    (entry.baseHash === null || isTransactionHash(entry.baseHash)) &&
    (entry.nextHash === null || isTransactionHash(entry.nextHash));
}

function isIndexedArtifactPath(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && /^[0-9]+\.bin$/.test(path.slice(prefix.length));
}

function isSafeJournalTarget(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized !== "" &&
    normalized === path &&
    !normalized.startsWith("/") &&
    !normalized.startsWith("../") &&
    !normalized.includes("/../") &&
    normalized !== ".tn" &&
    !normalized.startsWith(".tn/");
}

function isTransactionHash(value: unknown): value is AuthoringTransactionHash {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function transactionRoot(transactionId: string): string {
  return `.tn/authoring-transactions/${transactionId}`;
}

async function cleanupTransaction(projectPath: string, transactionId: string): Promise<void> {
  await rm(resolve(projectPath, transactionRoot(transactionId)), { force: true, recursive: true });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

function ignoreMissing(error: unknown): void {
  if (!isNodeError(error, "ENOENT")) throw error;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publishFailedDiagnostic(error: unknown): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_TRANSACTION_PUBLISH_FAILED",
    message: "The authoring transaction could not publish every file and was rolled back.",
    suggestion: "Resolve the filesystem error and apply the authoring batch again.",
    value: { error: errorMessage(error) },
  });
}

function recoveryFailedDiagnostic(transactionId: string, error: unknown): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_TRANSACTION_RECOVERY_FAILED",
    file: `${transactionRoot(transactionId)}/journal.json`,
    message: `Authoring transaction '${transactionId}' could not restore every old source file.`,
    suggestion: "Preserve the transaction directory and repair the source files from its backup artifacts.",
    value: { error: errorMessage(error), transactionId },
  });
}

function committedResult(
  journal: ITransactionJournal,
  recovered: boolean,
  diagnostics: IAuthoringDiagnostic[] = [],
): IAuthoringTransactionResult {
  return {
    committed: true,
    diagnostics: sortAuthoringDiagnostics(diagnostics),
    filesWritten: journal.entries.filter((entry) => entry.nextHash !== null).map((entry) => entry.path),
    ok: true,
    recovered,
    transactionId: journal.transactionId,
  };
}

function failedResult(transactionId: string, diagnostics: IAuthoringDiagnostic[], recovered: boolean): IAuthoringTransactionResult {
  return { committed: false, diagnostics: sortAuthoringDiagnostics(diagnostics), filesWritten: [], ok: false, recovered, transactionId };
}
