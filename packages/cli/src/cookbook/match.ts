import { type ICookbookEntry } from "./parse.js";

export interface ICookbookMatch {
  entry: ICookbookEntry;
  score: number;
}

export const COOKBOOK_MATCH_FLOOR = 3;

const WEIGHT_ID = 3;
const WEIGHT_KEYWORD = 3;
const WEIGHT_SURFACE = 2;
const WEIGHT_GOAL = 1;
const WEIGHT_CATEGORY = 1;

export function matchCookbookEntries(query: string, entries: readonly ICookbookEntry[]): ICookbookMatch[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }
  const matches: ICookbookMatch[] = [];
  for (const entry of entries) {
    const weights = entryTokenWeights(entry);
    let score = 0;
    for (const token of queryTokens) {
      score += weights.get(token) ?? 0;
    }
    if (score > 0) {
      matches.push({ entry, score });
    }
  }
  return matches.sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
}

export function bestCookbookMatch(query: string, entries: readonly ICookbookEntry[]): ICookbookEntry | undefined {
  const best = matchCookbookEntries(query, entries)[0];
  return best !== undefined && best.score >= COOKBOOK_MATCH_FLOOR ? best.entry : undefined;
}

export function matchCookbookEntryForBlock(blockId: string, entries: readonly ICookbookEntry[]): ICookbookEntry | undefined {
  const sorted = [...entries].sort((left, right) => left.id.localeCompare(right.id));
  const exact = sorted.find((entry) => entry.blocks?.includes(blockId) === true);
  if (exact !== undefined) {
    return exact;
  }
  return sorted.find((entry) => entry.blocks?.some((pattern) => pattern.endsWith(".*") && blockId.startsWith(pattern.slice(0, -1))) === true);
}

function entryTokenWeights(entry: ICookbookEntry): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (tokens: readonly string[], weight: number): void => {
    for (const token of tokens) {
      if ((weights.get(token) ?? 0) < weight) {
        weights.set(token, weight);
      }
    }
  };
  add(tokenize(entry.goal), WEIGHT_GOAL);
  add(tokenize(entry.category), WEIGHT_CATEGORY);
  add(entry.surfaces.flatMap((surface) => tokenize(surface)), WEIGHT_SURFACE);
  add((entry.keywords ?? []).flatMap((keyword) => tokenize(keyword)), WEIGHT_KEYWORD);
  add(tokenize(entry.id), WEIGHT_ID);
  return weights;
}

function tokenize(text: string): string[] {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2) {
      continue;
    }
    tokens.add(raw.length > 3 && raw.endsWith("s") ? raw.slice(0, -1) : raw);
  }
  return [...tokens];
}
