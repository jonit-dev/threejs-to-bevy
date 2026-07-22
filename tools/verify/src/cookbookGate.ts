import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_COMMAND_DEFINITIONS } from "@threenative/cli";
import { OVERLAY_SCAFFOLD_REGISTRY, overlayBuildScript } from "@threenative/cli/overlay-scaffold";
import { PRESCRIPTIVE_DIAGNOSTIC_CODES } from "@threenative/authoring";

export interface ICookbookGateCommandResult {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface ICookbookGateEntryResult {
  commands: ICookbookGateCommandResult[];
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  entryId: string;
  ok: boolean;
}

export interface ICookbookGateReport {
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  entries: ICookbookGateEntryResult[];
  generatedAt: string;
  ok: boolean;
  schema: "threenative.cookbook-verification";
  version: "0.1.0";
}

interface IParsedCookbookEntry {
  authoring?: "typed-spec";
  commands: string[];
  fixtureManifest?: string;
  id: string;
  proofCommands: string[];
  script: string;
  scriptPath?: string;
  providerBoundary?: "installed-tool-opt-in" | "local-reviewed-source" | "mock-only";
}

interface ICookbookFixtureFile {
  base64?: string;
  json?: unknown;
  path: string;
  sha256?: string;
  text?: string;
}

interface ICookbookFixtureManifest {
  files: ICookbookFixtureFile[];
  schema: "threenative.cookbook-fixture";
  version: "0.1.0";
}

export async function runCookbookGate(options: { entriesDir?: string; entryId?: string; externalTools?: boolean; root?: string; templateDir?: string } = {}): Promise<ICookbookGateReport> {
  const root = options.root ?? resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const entriesDir = options.entriesDir ?? resolve(root, "docs/cookbook");
  const templateDir = options.templateDir ?? resolve(root, "templates/structured-source-starter");
  const files = (await readdir(entriesDir)).filter((file) => file.endsWith(".md") && file !== "FORMAT.md" && (options.entryId === undefined || basename(file, ".md") === options.entryId)).sort();
  const entries: ICookbookGateEntryResult[] = [];
  const parsedEntries: IParsedCookbookEntry[] = [];
  for (const file of files) {
    const entryPath = resolve(entriesDir, file);
    const parsed = parseEntry(await readFile(entryPath, "utf8"), entryPath);
    if (parsed === undefined) {
      entries.push({
        commands: [],
        diagnostics: [{ code: "TN_COOKBOOK_GATE_PARSE_FAILED", message: `Unable to parse cookbook entry ${entryPath}.`, severity: "error" }],
        entryId: basename(file, ".md"),
        ok: false,
      });
      continue;
    }
    parsedEntries.push(parsed);
    entries.push(await verifyEntry({ entry: parsed, externalTools: options.externalTools === true, root, templateDir }));
  }
  const diagnostics = validateCookbookCrossReferences(parsedEntries, entriesDir, entriesDir === resolve(root, "docs/cookbook") && options.entryId === undefined);
  const report = {
    diagnostics,
    entries,
    generatedAt: new Date().toISOString(),
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error") && entries.every((entry) => entry.ok),
    schema: "threenative.cookbook-verification" as const,
    version: "0.1.0" as const,
  };
  return report;
}

async function verifyEntry(options: { entry: IParsedCookbookEntry; externalTools: boolean; root: string; templateDir: string }): Promise<ICookbookGateEntryResult> {
  const projectPath = resolve(tmpdir(), `tn-cookbook-${options.entry.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const commands: ICookbookGateCommandResult[] = [];
  const diagnostics: ICookbookGateEntryResult["diagnostics"] = [];
  try {
    if (hasEmptyExportBody(options.entry.script)) {
      diagnostics.push({
        code: "TN_COOKBOOK_GATE_EMPTY_SCRIPT_EXPORT",
        message: `Entry '${options.entry.id}' contains an exported function with an empty or comment-only body.`,
        severity: "error",
      });
      return { commands, diagnostics, entryId: options.entry.id, ok: false };
    }
    await cp(options.templateDir, projectPath, {
      recursive: true,
      filter: (source) => !source.includes("/node_modules/") && !source.includes("/dist/") && !source.includes("/artifacts/"),
    });
    if (options.entry.fixtureManifest !== undefined) {
      try {
        if (options.entry.providerBoundary === "local-reviewed-source") await validateCookbookFixtureReviewMetadata(options.root, options.entry.fixtureManifest);
        await materializeCookbookFixtureManifest(options.root, projectPath, options.entry.fixtureManifest);
      } catch (error) {
        diagnostics.push({
          code: "TN_COOKBOOK_GATE_FIXTURE_INVALID",
          message: `Entry '${options.entry.id}' fixture manifest failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: "error",
        });
        return { commands, diagnostics, entryId: options.entry.id, ok: false };
      }
    }
    if (options.entry.scriptPath !== undefined && options.entry.script.trim() !== "") {
      const outPath = resolve(projectPath, options.entry.scriptPath);
      const scriptBytes = `${options.entry.script.trim()}\n`;
      let fixtureOwned = false;
      if (options.entry.fixtureManifest !== undefined) {
        try {
          fixtureOwned = (await readFile(outPath, "utf8")) === scriptBytes;
          if (!fixtureOwned) {
            diagnostics.push({ code: "TN_COOKBOOK_GATE_FIXTURE_SCRIPT_CONFLICT", message: `Entry '${options.entry.id}' scriptPath conflicts with its fixture-owned file '${options.entry.scriptPath}'.`, severity: "error" });
            return { commands, diagnostics, entryId: options.entry.id, ok: false };
          }
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      if (!fixtureOwned) {
        await mkdir(resolve(outPath, ".."), { recursive: true });
        await writeFile(outPath, scriptBytes, "utf8");
      }
    }
    for (const command of options.entry.commands) {
      if (options.entry.providerBoundary === "mock-only" && command.startsWith("tn audio generate-sfx ")) continue;
      const result = runTnCommand(command, options.root, projectPath);
      commands.push(result);
      if (result.exitCode !== 0) {
        diagnostics.push({
          code: "TN_COOKBOOK_GATE_COMMAND_FAILED",
          message: `Entry '${options.entry.id}' command failed: ${command}`,
          severity: "error",
        });
        return { commands, diagnostics, entryId: options.entry.id, ok: false };
      }
    }
    if (options.entry.providerBoundary === "local-reviewed-source" || (options.entry.providerBoundary === "installed-tool-opt-in" && options.externalTools)) {
      for (const command of options.entry.proofCommands) {
        const result = runTnCommand(command, options.root, projectPath);
        commands.push(result);
        if (result.exitCode !== 0) {
          diagnostics.push({ code: "TN_COOKBOOK_GATE_EXTERNAL_PROOF_FAILED", message: `Entry '${options.entry.id}' external proof failed: ${command}`, severity: "error" });
          return { commands, diagnostics, entryId: options.entry.id, ok: false };
        }
      }
    }
    const overlayIds = await readDeclaredOverlayIds(projectPath);
    if (overlayIds.length > 0) {
      await makeWorkspaceDependenciesInstallable(projectPath, options.root);
      const install = runProjectCommand("pnpm install --ignore-scripts --no-frozen-lockfile", projectPath);
      commands.push(install);
      if (install.exitCode !== 0) {
        diagnostics.push({
          code: "TN_COOKBOOK_GATE_OVERLAY_INSTALL_FAILED",
          message: `Entry '${options.entry.id}' failed to install its scaffolded overlay dependencies.`,
          severity: "error",
        });
        return { commands, diagnostics, entryId: options.entry.id, ok: false };
      }
      const packageJson = JSON.parse(await readFile(resolve(projectPath, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
      for (const overlayId of overlayIds) {
        const scriptNames = [...new Set(OVERLAY_SCAFFOLD_REGISTRY.map((descriptor) => overlayBuildScript(descriptor, overlayId, descriptor.sourceDirectory).name))];
        const scriptName = scriptNames.find((candidate) => typeof packageJson.scripts?.[candidate] === "string");
        if (scriptName === undefined) {
          diagnostics.push({
            code: "TN_COOKBOOK_GATE_OVERLAY_BUILD_SCRIPT_MISSING",
            message: `Entry '${options.entry.id}' declares overlay '${overlayId}' without a descriptor-derived build script (${scriptNames.join(", ")}).`,
            severity: "error",
          });
          return { commands, diagnostics, entryId: options.entry.id, ok: false };
        }
        const build = runProjectCommand(`pnpm run ${scriptName}`, projectPath);
        commands.push(build);
        if (build.exitCode !== 0) {
          diagnostics.push({
            code: "TN_COOKBOOK_GATE_OVERLAY_BUILD_FAILED",
            message: `Entry '${options.entry.id}' failed generated overlay build script '${scriptName}'.`,
            severity: "error",
          });
          return { commands, diagnostics, entryId: options.entry.id, ok: false };
        }
      }
    }
    if (options.entry.authoring === "typed-spec") {
      const result = runTnCommand("tn authoring compile-typed-spec --project . --json", options.root, projectPath);
      commands.push(result);
      if (result.exitCode !== 0) {
        diagnostics.push({
          code: "TN_COOKBOOK_GATE_TYPED_SPEC_FAILED",
          message: `Entry '${options.entry.id}' failed typed spec compilation.`,
          severity: "error",
        });
        return { commands, diagnostics, entryId: options.entry.id, ok: false };
      }
    }
    for (const command of ["tn authoring validate --project . --json", "tn build --project . --json"]) {
      const result = runTnCommand(command, options.root, projectPath);
      commands.push(result);
      if (result.exitCode !== 0) {
        diagnostics.push({
          code: "TN_COOKBOOK_GATE_PROJECT_FAILED",
          message: `Entry '${options.entry.id}' failed validation/build command: ${command}`,
          severity: "error",
        });
        return { commands, diagnostics, entryId: options.entry.id, ok: false };
      }
    }
    return { commands, diagnostics, entryId: options.entry.id, ok: true };
  } finally {
    await rm(projectPath, { force: true, recursive: true });
  }
}

export async function validateCookbookFixtureReviewMetadata(root: string, manifestInput: string): Promise<void> {
  const manifestPath = containedPath(root, manifestInput, "fixture manifest");
  const [rootRealPath, manifestRealPath] = await Promise.all([realpath(root), realpath(manifestPath)]);
  assertContained(rootRealPath, manifestRealPath, "fixture manifest");
  const parsed = JSON.parse(await readFile(manifestRealPath, "utf8")) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.rights) || !isRecord(parsed.reviewedSource) || !isRecord(parsed.manualCompositionReview)) throw new Error("local-reviewed-source fixture requires rights, reviewedSource, and manualCompositionReview metadata");
  for (const field of ["creator", "copyrightOwner", "license", "permission", "evidenceKind", "limitations"] as const) {
    if (typeof parsed.rights[field] !== "string" || parsed.rights[field].trim() === "") throw new Error(`local-reviewed-source fixture rights.${field} must be a non-empty string`);
  }
  for (const field of ["repository", "commit", "skillVersion", "internalFork", "internalForkCommit", "internalForkTree", "reviewDecision", "reviewedAt"] as const) {
    if (typeof parsed.reviewedSource[field] !== "string" || parsed.reviewedSource[field].trim() === "") throw new Error(`local-reviewed-source fixture reviewedSource.${field} must be a non-empty string`);
  }
  if (parsed.reviewedSource.reviewDecision !== "accepted") throw new Error("local-reviewed-source fixture reviewedSource.reviewDecision must be 'accepted'");
  for (const field of ["reviewer", "decision", "scope", "observations", "previewHelpers"] as const) {
    if (typeof parsed.manualCompositionReview[field] !== "string" || parsed.manualCompositionReview[field].trim() === "") throw new Error(`local-reviewed-source fixture manualCompositionReview.${field} must be a non-empty string`);
  }
  if (parsed.manualCompositionReview.decision !== "accepted-for-bounded-fixture") throw new Error("local-reviewed-source fixture manualCompositionReview.decision must be 'accepted-for-bounded-fixture'");
  if (typeof parsed.manualCompositionReview.score !== "number" || !Number.isFinite(parsed.manualCompositionReview.score) || parsed.manualCompositionReview.score < 0 || parsed.manualCompositionReview.score > 1) throw new Error("local-reviewed-source fixture manualCompositionReview.score must be between 0 and 1");
}

export async function materializeCookbookFixtureManifest(root: string, projectPath: string, manifestInput: string): Promise<void> {
  const manifestPath = containedPath(root, manifestInput, "fixture manifest");
  const [rootRealPath, projectRealPath, manifestRealPath] = await Promise.all([realpath(root), realpath(projectPath), realpath(manifestPath)]);
  assertContained(rootRealPath, manifestRealPath, "fixture manifest");
  const parsed = JSON.parse(await readFile(manifestRealPath, "utf8")) as unknown;
  if (!isRecord(parsed) || parsed.schema !== "threenative.cookbook-fixture" || parsed.version !== "0.1.0" || !Array.isArray(parsed.files)) {
    throw new Error("expected schema 'threenative.cookbook-fixture' version '0.1.0' with a files array");
  }
  if (parsed.files.length === 0 || parsed.files.length > 32) throw new Error("files must contain between 1 and 32 entries");
  const manifest = parsed as unknown as ICookbookFixtureManifest;
  const hashes = new Map<string, string>();
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (!isRecord(file) || typeof file.path !== "string") throw new Error("each fixture file requires a path");
    const inputPath = file.path.replaceAll("\\", "/");
    const target = containedPath(projectPath, inputPath, "fixture file");
    const normalizedPath = relative(projectPath, target).replaceAll("\\", "/");
    if (seen.has(normalizedPath)) throw new Error(`duplicate fixture path '${normalizedPath}'`);
    seen.add(normalizedPath);
    const contentFields = ["base64", "json", "text"].filter((field) => Object.prototype.hasOwnProperty.call(file, field));
    if (contentFields.length !== 1) throw new Error(`fixture file '${normalizedPath}' must define exactly one of base64, json, or text`);
    let bytes: Buffer;
    if (contentFields[0] === "base64") {
      if (typeof file.base64 !== "string" || !isCanonicalBase64(file.base64)) throw new Error(`fixture file '${normalizedPath}' base64 content is invalid`);
      bytes = Buffer.from(file.base64, "base64");
    } else if (contentFields[0] === "text") {
      if (typeof file.text !== "string") throw new Error(`fixture file '${normalizedPath}' text content must be a string`);
      bytes = Buffer.from(resolveHashReferences(file.text, hashes), "utf8");
    } else {
      bytes = Buffer.from(`${JSON.stringify(resolveJsonHashReferences(file.json, hashes), null, 2)}\n`, "utf8");
    }
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > 2 * 1024 * 1024 || totalBytes > 8 * 1024 * 1024) throw new Error("fixture byte budget exceeded");
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (file.sha256 !== undefined && file.sha256 !== digest) throw new Error(`fixture hash mismatch for '${normalizedPath}'`);
    await mkdir(dirname(target), { recursive: true });
    const parentRealPath = await realpath(dirname(target));
    assertContained(projectRealPath, parentRealPath, "fixture file parent");
    try {
      if ((await lstat(target)).isSymbolicLink()) throw new Error(`fixture file '${normalizedPath}' targets a symbolic link`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await writeFile(target, bytes);
    hashes.set(normalizedPath, digest);
  }
}

function isCanonicalBase64(value: string): boolean {
  if (value === "" || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function resolveHashReferences(value: string, hashes: ReadonlyMap<string, string>): string {
  return value.replace(/\{\{sha256:([^}]+)\}\}/gu, (_match, path: string) => {
    const hash = hashes.get(path);
    if (hash === undefined) throw new Error(`hash reference '${path}' must name an earlier fixture file`);
    return `sha256:${hash}`;
  });
}

function resolveJsonHashReferences(value: unknown, hashes: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return resolveHashReferences(value, hashes);
  if (Array.isArray(value)) return value.map((entry) => resolveJsonHashReferences(entry, hashes));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveJsonHashReferences(entry, hashes)]));
  return value;
}

function containedPath(root: string, input: string, label: string): string {
  if (input.trim() === "" || isAbsolute(input)) throw new Error(`${label} path must be project-relative`);
  const target = resolve(root, input);
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) throw new Error(`${label} path escapes its owner`);
  return target;
}

function assertContained(root: string, target: string, label: string): void {
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) throw new Error(`${label} path escapes its owner through a symbolic link`);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readDeclaredOverlayIds(projectPath: string): Promise<string[]> {
  const ids = new Set<string>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".overlays.json")) {
        const document = JSON.parse(await readFile(path, "utf8")) as { overlays?: Array<{ id?: unknown }>; schema?: unknown };
        if (document.schema !== "threenative.overlays" || !Array.isArray(document.overlays)) continue;
        for (const overlay of document.overlays) if (typeof overlay.id === "string") ids.add(overlay.id);
      }
    }
  }
  await visit(resolve(projectPath, "content"));
  return [...ids].sort();
}

async function makeWorkspaceDependenciesInstallable(projectPath: string, root: string): Promise<void> {
  const packagePath = resolve(projectPath, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
  const workspacePackages = new Map<string, string>();
  for (const parent of ["packages", "tools"]) {
    const parentPath = resolve(root, parent);
    for (const entry of await readdir(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(await readFile(resolve(parentPath, entry.name, "package.json"), "utf8")) as { name?: unknown };
        if (typeof manifest.name === "string") workspacePackages.set(manifest.name, resolve(parentPath, entry.name));
      } catch { /* not a package directory */ }
    }
  }
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const dependencies = packageJson[field];
    if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies)) continue;
    for (const [name, version] of Object.entries(dependencies)) {
      if (name === "@threenative/overlay-client") {
        (dependencies as Record<string, unknown>)[name] = `file:${resolve(root, "packages/overlay-client")}`;
        continue;
      }
      // Cookbook commands run the already-built repository CLI directly. The
      // generated project's private workspace package links are unnecessary
      // for compiling its overlay and are not installable outside the repo
      // workspace, so keep the install isolated to project-local web deps.
      if (name.startsWith("@threenative/") && typeof version === "string" && (version.startsWith("workspace:") || version.startsWith("file:"))) {
        delete (dependencies as Record<string, unknown>)[name];
        continue;
      }
      if (typeof version !== "string" || !version.startsWith("workspace:")) continue;
      const localPath = workspacePackages.get(name);
      if (localPath !== undefined) (dependencies as Record<string, unknown>)[name] = `file:${localPath}`;
    }
  }
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

function runProjectCommand(command: string, cwd: string): ICookbookGateCommandResult {
  const args = splitCommand(command);
  const executable = args.shift()!;
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", env: { ...process.env, INIT_CWD: cwd }, maxBuffer: 1024 * 1024 * 10 });
  return { command, exitCode: result.status ?? 1, stderr: result.stderr, stdout: result.stdout };
}

function runTnCommand(command: string, root: string, cwd: string): ICookbookGateCommandResult {
  const args = splitCommand(command);
  const executable = args.shift();
  if (executable !== "tn") {
    return { command, exitCode: 1, stderr: "Cookbook gate only supports commands starting with tn.", stdout: "" };
  }
  const result = spawnSync(process.execPath, [resolve(root, "packages/cli/dist/index.js"), "--", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, INIT_CWD: cwd },
    maxBuffer: 1024 * 1024 * 10,
  });
  return {
    command,
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function parseEntry(source: string, file: string): IParsedCookbookEntry | undefined {
  const id = /^id:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const authoringValue = /^authoring:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const fixtureManifest = /^fixtureManifest:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const providerBoundaryValue = /^providerBoundary:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const scriptPath = /^scriptPath:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const commands = section(source, "commands")?.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
  const proofCommands = section(source, "proof")?.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#") && line.startsWith("tn ")) ?? [];
  const script = section(source, "script") ?? "";
  const authoring = authoringValue === "typed-spec" ? authoringValue : undefined;
  const providerBoundary = providerBoundaryValue === "mock-only" || providerBoundaryValue === "installed-tool-opt-in" || providerBoundaryValue === "local-reviewed-source" ? providerBoundaryValue : undefined;
  return id === undefined || commands === undefined ? undefined : { authoring, commands, fixtureManifest, id, proofCommands, providerBoundary, script, scriptPath };
}

function validateCookbookCrossReferences(
  parsedEntries: readonly IParsedCookbookEntry[],
  entriesDir: string,
  validateDiagnosticReferences: boolean,
): Array<{ code: string; message: string; severity: "error" | "warning" }> {
  const diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
  const cookbookIds = new Set(parsedEntries.map((entry) => entry.id));
  if (validateDiagnosticReferences) {
    for (const code of PRESCRIPTIVE_DIAGNOSTIC_CODES) {
      const cookbookId = code.fix.cookbook;
      if (cookbookId !== undefined && !cookbookIds.has(cookbookId)) {
        diagnostics.push({
          code: "TN_COOKBOOK_GATE_COOKBOOK_REFERENCE_INVALID",
          message: `Diagnostic '${code.code}' references missing cookbook entry '${cookbookId}' in ${entriesDir}.`,
          severity: "error",
        });
      }
    }
  }
  for (const entry of parsedEntries) {
    for (const command of entry.commands) {
      diagnostics.push(...validateCookbookCommand(entry.id, command));
    }
    for (const command of entry.proofCommands) {
      diagnostics.push(...validateCookbookCommand(entry.id, command));
    }
  }
  return diagnostics;
}

function validateCookbookCommand(entryId: string, command: string): Array<{ code: string; message: string; severity: "error" | "warning" }> {
  const args = splitCommand(command);
  if (args[0] !== "tn") {
    return [{ code: "TN_COOKBOOK_GATE_COMMAND_REGISTRY_INVALID", message: `Entry '${entryId}' command does not start with 'tn': ${command}`, severity: "error" }];
  }
  const rootCommand = args[1];
  const definition = rootCommand === undefined ? undefined : CLI_COMMAND_DEFINITIONS[rootCommand];
  if (definition === undefined) {
    return [{ code: "TN_COOKBOOK_GATE_COMMAND_REGISTRY_INVALID", message: `Entry '${entryId}' command uses unregistered CLI command '${rootCommand ?? ""}': ${command}`, severity: "error" }];
  }
  if (definition.subcommands !== undefined) {
    const subcommand = args[2]?.startsWith("-") === false ? args[2] : undefined;
    if (subcommand !== undefined && !definition.subcommands.includes(subcommand)) {
      return [{ code: "TN_COOKBOOK_GATE_COMMAND_REGISTRY_INVALID", message: `Entry '${entryId}' command uses unregistered '${rootCommand}' subcommand '${subcommand}': ${command}`, severity: "error" }];
    }
  }
  return [];
}

function hasEmptyExportBody(source: string): boolean {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return /export\s+(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*(?:[:][^{]+)?\{\s*\}/m.test(withoutComments);
}

function section(source: string, name: string): string | undefined {
  return new RegExp(`^## ${name}\\s*\\n\`\`\`[^\\n]*\\n([\\s\\S]*?)\\n\`\`\``, "m").exec(source)?.[1];
}

function splitCommand(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "\"" | "'" | undefined;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if ((char === "\"" || char === "'") && quote === undefined) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = undefined;
      continue;
    }
    if (/\s/.test(char) && quote === undefined) {
      if (current !== "") {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current !== "") {
    args.push(current);
  }
  return args;
}

async function main(): Promise<void> {
  const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const entryIndex = process.argv.indexOf("--entry");
  const report = await runCookbookGate({ externalTools: process.argv.includes("--external-tools"), root, ...(entryIndex === -1 ? {} : { entryId: process.argv[entryIndex + 1] }) });
  const outPath = resolve(root, "tools/verify/artifacts/cookbook/verification-report.json");
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ code: report.ok ? "TN_COOKBOOK_GATE_OK" : "TN_COOKBOOK_GATE_FAILED", report, reportPath: outPath }, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
