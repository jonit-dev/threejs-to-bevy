import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type ICommandResult } from "../diagnostics.js";
import { parseCookbookEntry, type ICookbookEntry } from "../cookbook/parse.js";

export async function cookbookCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const subcommand = normalizedArgv.find((arg) => !arg.startsWith("--"));
  if (subcommand === "list") {
    const entries = await loadCookbookEntries(cwd);
    const rows = entries.map(({ category, goal, id, surfaces }) => ({ category, goal, id, surfaces })).sort((left, right) => left.id.localeCompare(right.id));
    return render({ code: "TN_COOKBOOK_LIST_OK", count: rows.length, entries: rows }, json, 0);
  }
  if (subcommand === "show") {
    const id = normalizedArgv.find((arg, index) => index > normalizedArgv.indexOf("show") && !arg.startsWith("--"));
    if (id === undefined) {
      return render({ code: "TN_COOKBOOK_SHOW_ID_MISSING", message: "Usage: tn cookbook show <id> [--json]" }, json, 2);
    }
    const entries = await loadCookbookEntries(cwd);
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      return render({
        code: "TN_COOKBOOK_UNKNOWN_ID",
        diagnostics: [{
          code: "TN_COOKBOOK_UNKNOWN_ID",
          message: `Cookbook entry '${id}' was not found.`,
          severity: "error",
          suggestion: nearestId(id, entries.map((candidate) => candidate.id)),
        }],
        id,
        suggestion: nearestId(id, entries.map((candidate) => candidate.id)),
      }, json, 1);
    }
    return render({ code: "TN_COOKBOOK_SHOW_OK", entry }, json, 0);
  }
  return render({ code: "TN_COOKBOOK_USAGE", message: "Usage: tn cookbook list --json | tn cookbook show <id> --json" }, json, 2);
}

export async function loadCookbookEntries(cwd = process.cwd()): Promise<ICookbookEntry[]> {
  const directory = await resolveCookbookDirectory(cwd);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".md") && file !== "FORMAT.md").sort();
  const entries: ICookbookEntry[] = [];
  for (const file of files) {
    const path = resolve(directory, file);
    const parsed = parseCookbookEntry(await readFile(path, "utf8"), path);
    if (parsed.entry !== undefined) {
      entries.push(parsed.entry);
    }
  }
  return entries;
}

async function resolveCookbookDirectory(cwd: string): Promise<string> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, "../data/cookbook"),
    resolve(cwd, "docs/cookbook"),
    resolve(moduleDir, "../../../../docs/cookbook"),
  ];
  for (const candidate of candidates) {
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      // Try the next source checkout or packaged location.
    }
  }
  return candidates[0]!;
}

function nearestId(input: string, ids: readonly string[]): string | undefined {
  let best: { distance: number; id: string } | undefined;
  for (const id of ids) {
    const distance = levenshtein(input, id);
    if (best === undefined || distance < best.distance) {
      best = { distance, id };
    }
  }
  return best?.id;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current[rightIndex + 1] = left[leftIndex] === right[rightIndex]
        ? previous[rightIndex]!
        : Math.min(previous[rightIndex]!, previous[rightIndex + 1]!, current[rightIndex]!) + 1;
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function render(payload: unknown, json: boolean, exitCode: number): ICommandResult {
  return {
    exitCode,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${JSON.stringify(payload)}\n`,
  };
}
