import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  entries: ICookbookGateEntryResult[];
  generatedAt: string;
  ok: boolean;
  schema: "threenative.cookbook-verification";
  version: "0.1.0";
}

interface IParsedCookbookEntry {
  commands: string[];
  id: string;
  script: string;
  scriptPath?: string;
}

export async function runCookbookGate(options: { entriesDir?: string; root?: string; templateDir?: string } = {}): Promise<ICookbookGateReport> {
  const root = options.root ?? resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const entriesDir = options.entriesDir ?? resolve(root, "docs/cookbook");
  const templateDir = options.templateDir ?? resolve(root, "templates/structured-source-starter");
  const files = (await readdir(entriesDir)).filter((file) => file.endsWith(".md") && file !== "FORMAT.md").sort();
  const entries: ICookbookGateEntryResult[] = [];
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
    entries.push(await verifyEntry({ entry: parsed, root, templateDir }));
  }
  const report = {
    entries,
    generatedAt: new Date().toISOString(),
    ok: entries.every((entry) => entry.ok),
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
    await cp(options.templateDir, projectPath, {
      recursive: true,
      filter: (source) => !source.includes("/node_modules/") && !source.includes("/dist/") && !source.includes("/artifacts/"),
    });
    for (const command of options.entry.commands) {
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
    if (options.entry.scriptPath !== undefined && options.entry.script.trim() !== "") {
      const outPath = resolve(projectPath, options.entry.scriptPath);
      await mkdir(resolve(outPath, ".."), { recursive: true });
      await writeFile(outPath, `${options.entry.script.trim()}\n`, "utf8");
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
  const scriptPath = /^scriptPath:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const commands = section(source, "commands")?.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
  const script = section(source, "script") ?? "";
  return id === undefined || commands === undefined ? undefined : { commands, id, script, scriptPath };
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
