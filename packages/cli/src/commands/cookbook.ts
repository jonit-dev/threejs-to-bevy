import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type ICommandResult } from "../diagnostics.js";
import { COOKBOOK_MATCH_FLOOR, matchCookbookEntries } from "../cookbook/match.js";
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
    return showCookbookEntry(id, cwd, json);
  }
  if (subcommand === "search") {
    const searchIndex = normalizedArgv.indexOf("search");
    const query = normalizedArgv.filter((arg, index) => index > searchIndex && !arg.startsWith("--")).join(" ");
    if (query === "") {
      return render({ code: "TN_COOKBOOK_SEARCH_QUERY_MISSING", message: "Usage: tn cookbook search <query> [--json]" }, json, 2);
    }
    return searchCookbookEntries(query, cwd, json);
  }
  if (subcommand !== undefined) {
    return showCookbookEntry(subcommand, cwd, json);
  }
  return render({ code: "TN_COOKBOOK_USAGE", message: "Usage: tn cookbook list --json | tn cookbook show <id> --json | tn cookbook search <query> --json | tn cookbook <id> --json" }, json, 2);
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

async function showCookbookEntry(id: string, cwd: string, json: boolean): Promise<ICommandResult> {
  const entries = await loadCookbookEntries(cwd);
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    const suggestion = cookbookSuggestion(id, entries);
    return render({
      code: "TN_COOKBOOK_UNKNOWN_ID",
      diagnostics: [{
        code: "TN_COOKBOOK_UNKNOWN_ID",
        message: `Cookbook entry '${id}' was not found. Try 'tn cookbook search "${id}" --json'.`,
        severity: "error",
        suggestion,
      }],
      id,
      suggestion,
    }, json, 1);
  }
  return render({ code: "TN_COOKBOOK_SHOW_OK", entry }, json, 0);
}

async function searchCookbookEntries(query: string, cwd: string, json: boolean): Promise<ICommandResult> {
  const entries = await loadCookbookEntries(cwd);
  const matches = matchCookbookEntries(query, entries)
    .filter((match) => match.score >= COOKBOOK_MATCH_FLOOR)
    .slice(0, 5)
    .map(({ entry, score }) => ({ category: entry.category, goal: entry.goal, id: entry.id, score, surfaces: entry.surfaces }));
  return render({
    code: "TN_COOKBOOK_SEARCH_OK",
    count: matches.length,
    matches,
    query,
    ...(matches.length === 0
      ? { diagnostics: [{ code: "TN_COOKBOOK_SEARCH_EMPTY", message: `No cookbook entry matches '${query}'. Run tn cookbook list --json for all entries.`, severity: "warning" as const }] }
      : {}),
  }, json, 0);
}

function cookbookSuggestion(input: string, entries: readonly ICookbookEntry[]): string {
  const best = matchCookbookEntries(input, entries)[0];
  if (best !== undefined && best.score >= COOKBOOK_MATCH_FLOOR) {
    return best.entry.id;
  }
  return "tn cookbook list --json";
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

function render(payload: unknown, json: boolean, exitCode: number): ICommandResult {
  return {
    exitCode,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${JSON.stringify(payload)}\n`,
  };
}
