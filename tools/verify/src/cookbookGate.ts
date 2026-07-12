import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
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
  id: string;
  proofCommands: string[];
  script: string;
  scriptPath?: string;
  providerBoundary?: "mock-only";
}

export async function runCookbookGate(options: { entriesDir?: string; root?: string; templateDir?: string } = {}): Promise<ICookbookGateReport> {
  const root = options.root ?? resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const entriesDir = options.entriesDir ?? resolve(root, "docs/cookbook");
  const templateDir = options.templateDir ?? resolve(root, "templates/structured-source-starter");
  const files = (await readdir(entriesDir)).filter((file) => file.endsWith(".md") && file !== "FORMAT.md").sort();
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
    entries.push(await verifyEntry({ entry: parsed, root, templateDir }));
  }
  const diagnostics = validateCookbookCrossReferences(parsedEntries, entriesDir, entriesDir === resolve(root, "docs/cookbook"));
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

async function verifyEntry(options: { entry: IParsedCookbookEntry; root: string; templateDir: string }): Promise<ICookbookGateEntryResult> {
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
    if (options.entry.scriptPath !== undefined && options.entry.script.trim() !== "") {
      const outPath = resolve(projectPath, options.entry.scriptPath);
      await mkdir(resolve(outPath, ".."), { recursive: true });
      await writeFile(outPath, `${options.entry.script.trim()}\n`, "utf8");
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
  const providerBoundaryValue = /^providerBoundary:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const scriptPath = /^scriptPath:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const commands = section(source, "commands")?.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
  const proofCommands = section(source, "proof")?.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#") && line.startsWith("tn ")) ?? [];
  const script = section(source, "script") ?? "";
  const authoring = authoringValue === "typed-spec" ? authoringValue : undefined;
  const providerBoundary = providerBoundaryValue === "mock-only" ? providerBoundaryValue : undefined;
  return id === undefined || commands === undefined ? undefined : { authoring, commands, id, proofCommands, providerBoundary, script, scriptPath };
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
    const subcommand = args.slice(2).find((arg) => !arg.startsWith("-"));
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
  const report = await runCookbookGate({ root });
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
