import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { formatOverlayAddUsage, listOverlayStyles, overlayBuildScript, resolveOverlayScaffold, resolveOverlayTemplateFiles, supportedOverlayFlags } from "../overlays/scaffoldRegistry.js";

type TransactionPhase = "stage" | "commit" | "cleanup";
interface IOverlayAddOptions { beforeCommit?: (index: number, path: string) => void | Promise<void>; cwd?: string; transactionHook?: (phase: TransactionPhase, index: number, path: string) => void | Promise<void> }
interface IJsonObject { [key: string]: unknown }
interface IOverlayDocument extends IJsonObject { overlays: IJsonObject[]; schema: string; version: string }

export async function overlayCommand(argv: readonly string[], options: IOverlayAddOptions = {}): Promise<ICommandResult> {
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  const json = normalized.includes("--json");
  if (normalized[0] !== "add") return usageDiagnostic(json, "Expected the 'add' overlay subcommand.");
  return overlayAddCommand(normalized.slice(1), options);
}

export async function overlayAddCommand(argv: readonly string[], options: IOverlayAddOptions = {}): Promise<ICommandResult> {
  const parsed = parseArguments(argv);
  if (!parsed.ok) return usageDiagnostic(parsed.json, parsed.message);
  const { json, name, project, style } = parsed;
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
    return failure("TN_OVERLAY_ID_INVALID", json, `Overlay name '${name}' is not a stable ID.`, name, "Use lowercase letters and numbers separated by single hyphens (for example, inventory-panel).", { overlayId: name });
  }
  const descriptor = resolveOverlayScaffold(style);
  if (descriptor === undefined) {
    return failure("TN_OVERLAY_STYLE_UNSUPPORTED", json, `Overlay style '${style}' is not supported.`, undefined, `Choose one of: ${listOverlayStyles().join(", ")}.`, { style, styles: listOverlayStyles() });
  }

  const cwd = options.cwd ?? process.env.INIT_CWD ?? process.cwd();
  const projectPath = resolve(cwd, project ?? ".");
  const packagePath = resolve(projectPath, "package.json");
  const configPath = resolve(projectPath, "threenative.config.json");
  let packageJson: IJsonObject;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8")) as IJsonObject;
    const config = JSON.parse(await readFile(configPath, "utf8")) as IJsonObject;
    if (config.schema !== "threenative.project") throw new Error("unsupported config");
  } catch {
    return failure("TN_OVERLAY_ADD_USAGE", json, `Project '${projectPath}' is not a supported ThreeNative project.`, projectPath, "Run the command from a generated ThreeNative project or pass --project <path>.");
  }

  const sourceDirectory = `${descriptor.sourceDirectory}/${name}`;
  const plannedFiles = resolveOverlayTemplateFiles(import.meta.url, descriptor).map((template) => ({
    destination: resolve(projectPath, sourceDirectory, template.destination),
    relativePath: `${sourceDirectory}/${template.destination}`,
    template: template.source,
  }));
  for (const file of plannedFiles) {
    if (await exists(file.destination)) return conflict(json, file.relativePath, `Generated path '${file.relativePath}' already exists.`);
  }

  const scripts = asObject(packageJson.scripts);
  const dependencies = asObject(packageJson.dependencies);
  const devDependencies = asObject(packageJson.devDependencies);
  const script = overlayBuildScript(descriptor, name, sourceDirectory);
  const buildScriptName = script.name;
  const buildScript = script.command;
  const packageConflict = findPackageConflict(scripts, buildScriptName, buildScript)
    ?? findDependencyConflict(dependencies, descriptor.dependencies, "dependencies")
    ?? findDependencyConflict(devDependencies, descriptor.devDependencies, "devDependencies")
    ?? findOppositeRoleConflict(devDependencies, descriptor.dependencies, "devDependencies", "dependency")
    ?? findOppositeRoleConflict(dependencies, descriptor.devDependencies, "dependencies", "devDependency");
  if (packageConflict !== undefined) return conflict(json, `package.json#/${packageConflict.key}`, packageConflict.message);

  const overlayFiles = await findOverlayDocuments(resolve(projectPath, "content"));
  // The canonical document owns new declarations when present. Otherwise the
  // lexicographically first existing document is the deterministic owner.
  const canonicalOverlayPath = resolve(projectPath, "content/overlays/webview.overlays.json");
  const overlayPath = overlayFiles.includes(canonicalOverlayPath) ? canonicalOverlayPath : overlayFiles[0] ?? canonicalOverlayPath;
  const parsedOverlayDocuments: Array<{ document: IOverlayDocument; path: string }> = [];
  for (const path of overlayFiles) {
    try {
      const document = JSON.parse(await readFile(path, "utf8")) as IOverlayDocument;
      if (document.schema !== "threenative.overlays" || !Array.isArray(document.overlays)) throw new Error("invalid overlay document");
      parsedOverlayDocuments.push({ document, path });
    } catch {
      return conflict(json, relative(projectPath, path), "Existing overlay declaration is malformed or unsupported.");
    }
  }
  const existingIds = new Map<string, string>();
  for (const item of parsedOverlayDocuments) for (const overlay of item.document.overlays) {
    if (typeof overlay.id !== "string") continue;
    const previous = existingIds.get(overlay.id);
    if (previous !== undefined) return conflict(json, relative(projectPath, item.path), `Overlay ID '${overlay.id}' is duplicated across '${previous}' and '${relative(projectPath, item.path)}'.`);
    existingIds.set(overlay.id, relative(projectPath, item.path));
  }
  let overlayDocument: IOverlayDocument = { schema: "threenative.overlays", version: "0.1.0", overlays: [] };
  overlayDocument = parsedOverlayDocuments.find((item) => item.path === overlayPath)?.document ?? overlayDocument;
  if (existingIds.has(name)) return conflict(json, `${existingIds.get(name)}#/overlays/${name}`, `Overlay ID '${name}' is already declared.`);

  const entry = `${sourceDirectory}/${descriptor.entry}`;
  const nextOverlayDocument: IOverlayDocument = {
    ...overlayDocument,
    overlays: [...overlayDocument.overlays, {
      entry,
      id: name,
      input: "pointer",
      messages: { gameToOverlay: [{ name: "overlay:snapshot", schema: { fields: { message: "string" }, kind: "object", required: ["message"] } }], overlayToGame: [{ name: "overlay:action", schema: { fields: { action: "string" }, kind: "object", required: ["action"] } }] },
      targetProfiles: ["web", "desktop"],
      transparent: true,
      zIndex: 20,
    }],
  };
  const nextPackage = {
    ...packageJson,
    scripts: { ...scripts, [buildScriptName]: buildScript },
    dependencies: { ...dependencies, ...descriptor.dependencies },
    devDependencies: { ...devDependencies, ...descriptor.devDependencies },
  };

  const writes: Array<{ contents: string; path: string }> = [];
  for (const file of plannedFiles) {
    writes.push({ contents: await readFile(file.template, "utf8"), path: file.destination });
  }
  writes.push({ contents: `${JSON.stringify(nextOverlayDocument, null, 2)}\n`, path: overlayPath });
  writes.push({ contents: `${JSON.stringify(nextPackage, null, 2)}\n`, path: packagePath });
  try {
    await commitTransaction(writes, options.beforeCommit, options.transactionHook);
  } catch (error) {
    return failure("TN_OVERLAY_SCAFFOLD_WRITE_FAILED", json, `Overlay scaffold transaction failed: ${error instanceof Error ? error.message : String(error)}.`, projectPath, "Resolve the filesystem error and retry; the project files were restored.");
  }

  const changedFiles = [...plannedFiles.map((file) => file.relativePath), relative(projectPath, overlayPath).split("\\").join("/"), "package.json"].sort();
  const payload = {
    code: "TN_OVERLAY_ADD_OK",
    changedFiles,
    dependencies: descriptor.dependencies,
    devDependencies: descriptor.devDependencies,
    entry,
    message: `Scaffolded '${name}' with the ${descriptor.style} React overlay preset.`,
    nextCommands: ["pnpm install", `pnpm run ${buildScriptName}`, "pnpm run build"],
    overlayId: name,
    path: projectPath,
    scripts: { [buildScriptName]: buildScript },
    style: descriptor.style,
  };
  return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\nNext commands:\n${payload.nextCommands.map((command) => `  ${command}`).join("\n")}\n` };
}

type Parsed = { json: boolean; name: string; ok: true; project?: string; style?: string } | { json: boolean; message: string; ok: false };
function parseArguments(argv: readonly string[]): Parsed {
  const supportedFlags = new Set(supportedOverlayFlags());
  const json = supportedFlags.has("--json") && argv.includes("--json");
  let name: string | undefined;
  let project: string | undefined;
  let style: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("-") && !supportedFlags.has(arg)) return { json, message: `Unknown flag '${arg}'.`, ok: false };
    if (arg === "--json") continue;
    if (arg === "--style" || arg === "--project") {
      if (seen.has(arg)) return { json, message: `Flag '${arg}' may only be provided once.`, ok: false };
      seen.add(arg);
      const value = argv[++index];
      if (value === undefined || value.startsWith("-")) return { json, message: `Flag '${arg}' requires a value.`, ok: false };
      if (arg === "--style") style = value; else project = value;
      continue;
    }
    if (arg.startsWith("-")) return { json, message: `Flag '${arg}' is supported by the descriptor but has no parser binding.`, ok: false };
    if (name !== undefined) return { json, message: "Only one overlay name may be provided.", ok: false };
    name = arg;
  }
  return name === undefined ? { json, message: "An overlay name is required.", ok: false } : { json, name, ok: true, ...(project === undefined ? {} : { project }), ...(style === undefined ? {} : { style }) };
}

function usageDiagnostic(json: boolean, message: string): ICommandResult {
  return failure("TN_OVERLAY_ADD_USAGE", json, `${message} Usage: ${formatOverlayAddUsage()}.`, undefined, "Use the canonical overlay add syntax.");
}
function conflict(json: boolean, path: string, message: string): ICommandResult {
  return failure("TN_OVERLAY_SCAFFOLD_CONFLICT", json, message, path, "Choose another overlay name or reconcile the existing path/key before retrying.");
}
function failure(code: string, json: boolean, message: string, path?: string, instruction?: string, extra: IJsonObject = {}): ICommandResult {
  return diagnosticResult({ code, message, ...(path === undefined ? {} : { path }), ...(instruction === undefined ? {} : { fix: { instruction } }), ...extra }, { exitCode: 1, json, stderr: true });
}
function asObject(value: unknown): IJsonObject { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as IJsonObject : {}; }
function findPackageConflict(record: IJsonObject, key: string, value: string): { key: string; message: string } | undefined {
  return record[key] !== undefined && record[key] !== value ? { key: `scripts/${key}`, message: `Script '${key}' already has a different command.` } : undefined;
}
function findDependencyConflict(record: IJsonObject, requested: Readonly<Record<string, string>>, role: "dependencies" | "devDependencies"): { key: string; message: string } | undefined {
  for (const [name, version] of Object.entries(requested)) if (record[name] !== undefined && record[name] !== version) return { key: `${role}/${name}`, message: `Dependency '${name}' already uses '${String(record[name])}', not descriptor version '${version}'.` };
  return undefined;
}
function findOppositeRoleConflict(record: IJsonObject, requested: Readonly<Record<string, string>>, actualRole: "dependencies" | "devDependencies", requestedRole: string): { key: string; message: string } | undefined {
  for (const name of Object.keys(requested)) if (record[name] !== undefined) return { key: `${actualRole}/${name}`, message: `Package '${name}' already appears in ${actualRole}, but the scaffold requires it as a ${requestedRole}.` };
  return undefined;
}
async function findOverlayDocuments(root: string): Promise<string[]> {
  if (!await exists(root)) return [];
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await findOverlayDocuments(path));
    else if (entry.isFile() && entry.name.endsWith(".overlays.json")) found.push(path);
  }
  return found.sort();
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
async function commitTransaction(writes: readonly { contents: string; path: string }[], beforeCommit?: IOverlayAddOptions["beforeCommit"], transactionHook?: IOverlayAddOptions["transactionHook"]): Promise<void> {
  const nonce = `${process.pid}-${Date.now()}`;
  const staged: Array<{ backup: string; existed: boolean; path: string; stage: string }> = [];
  try {
    for (const write of writes) {
      await mkdir(dirname(write.path), { recursive: true });
      const stage = `${write.path}.tn-overlay-${nonce}.stage`;
      const item = { backup: `${write.path}.tn-overlay-${nonce}.backup`, existed: await exists(write.path), path: write.path, stage };
      staged.push(item);
      await transactionHook?.("stage", staged.length - 1, write.path);
      await writeFile(stage, write.contents, "utf8");
    }
    for (let index = 0; index < staged.length; index += 1) {
      const item = staged[index]!;
      await beforeCommit?.(index, item.path);
      await transactionHook?.("commit", index, item.path);
      if (item.existed) await rename(item.path, item.backup);
      await rename(item.stage, item.path);
    }
  } catch (error) {
    for (const item of [...staged].reverse()) {
      await rm(item.stage, { force: true });
      if (await exists(item.backup)) {
        await rm(item.path, { force: true });
        await rename(item.backup, item.path);
      } else if (!item.existed) {
        await rm(item.path, { force: true });
      }
    }
    throw error;
  }
  // Cleanup happens only after the commit is irrevocably complete. A cleanup
  // failure cannot trigger rollback after another backup has been deleted.
  for (let index = 0; index < staged.length; index += 1) {
    const item = staged[index]!;
    if (!item.existed) continue;
    try {
      await transactionHook?.("cleanup", index, item.backup);
      await rm(item.backup, { force: true });
    } catch {
      // A stale, uniquely named backup is safe; cleanup must never roll back
      // an already committed transaction after other backups were deleted.
    }
  }
}
