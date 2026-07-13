export interface ICookbookEntryFrontmatter {
  blocks?: string[];
  category: string;
  goal: string;
  id: string;
  keywords?: string[];
  scriptPath?: string;
  surfaces: string[];
}

export interface ICookbookEntry extends ICookbookEntryFrontmatter {
  commands: string;
  file: string;
  proof: string;
  script: string;
  sourceDelta: string;
}

export interface ICookbookDiagnostic {
  code: string;
  file?: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
  suggestion?: string;
}

export interface ICookbookParseResult {
  diagnostics: ICookbookDiagnostic[];
  entry?: ICookbookEntry;
  ok: boolean;
}

const requiredSections = ["commands", "source-delta", "script", "proof"] as const;

export function parseCookbookEntry(source: string, file = "<cookbook-entry>"): ICookbookParseResult {
  const diagnostics: ICookbookDiagnostic[] = [];
  const frontmatter = parseFrontmatter(source, file, diagnostics);
  const sections = parseSections(source);
  for (const section of requiredSections) {
    if ((sections.get(section)?.trim() ?? "") === "") {
      diagnostics.push({
        code: "TN_COOKBOOK_ENTRY_INVALID",
        file,
        message: `Cookbook entry is missing required '${section}' section.`,
        path: `/sections/${section}`,
        severity: "error",
        suggestion: `Add a '## ${section}' heading followed by a fenced code block.`,
      });
    }
  }
  if (frontmatter === undefined || diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { diagnostics, ok: false };
  }
  return {
    diagnostics,
    entry: {
      ...frontmatter,
      commands: sections.get("commands")?.trim() ?? "",
      file,
      proof: sections.get("proof")?.trim() ?? "",
      script: sections.get("script")?.trim() ?? "",
      sourceDelta: sections.get("source-delta")?.trim() ?? "",
    },
    ok: true,
  };
}

function parseFrontmatter(source: string, file: string, diagnostics: ICookbookDiagnostic[]): ICookbookEntryFrontmatter | undefined {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) {
    diagnostics.push({
      code: "TN_COOKBOOK_ENTRY_INVALID",
      file,
      message: "Cookbook entry is missing YAML frontmatter.",
      path: "/frontmatter",
      severity: "error",
    });
    return undefined;
  }
  const values: Record<string, string | string[]> = {};
  let currentList: string | undefined;
  for (const line of match[1]!.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }
    const listItem = /^\s*-\s+(.+)$/.exec(line);
    if (listItem !== null && currentList !== undefined) {
      const existing = values[currentList];
      values[currentList] = [...(Array.isArray(existing) ? existing : []), listItem[1]!.trim()];
      continue;
    }
    const field = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (field === null) {
      diagnostics.push({
        code: "TN_COOKBOOK_ENTRY_INVALID",
        file,
        message: `Unsupported frontmatter line: ${line}`,
        path: "/frontmatter",
        severity: "error",
      });
      continue;
    }
    currentList = undefined;
    const key = field[1]!;
    const value = field[2]!.trim();
    if (value === "") {
      values[key] = [];
      currentList = key;
    } else {
      values[key] = stripQuotes(value);
    }
  }
  const id = stringField(values, "id");
  const goal = stringField(values, "goal");
  const category = stringField(values, "category");
  const surfaces = values.surfaces;
  for (const key of ["id", "goal", "category"] as const) {
    if (stringField(values, key) === undefined) {
      diagnostics.push({
        code: "TN_COOKBOOK_ENTRY_INVALID",
        file,
        message: `Cookbook entry frontmatter requires '${key}'.`,
        path: `/frontmatter/${key}`,
        severity: "error",
      });
    }
  }
  if (!Array.isArray(surfaces) || surfaces.length === 0) {
    diagnostics.push({
      code: "TN_COOKBOOK_ENTRY_INVALID",
      file,
      message: "Cookbook entry frontmatter requires at least one surface.",
      path: "/frontmatter/surfaces",
      severity: "error",
    });
  }
  if (id === undefined || goal === undefined || category === undefined || !Array.isArray(surfaces)) {
    return undefined;
  }
  return {
    ...(Array.isArray(values.blocks) && values.blocks.length > 0 ? { blocks: values.blocks } : {}),
    category,
    goal,
    id,
    ...(Array.isArray(values.keywords) && values.keywords.length > 0 ? { keywords: values.keywords } : {}),
    scriptPath: stringField(values, "scriptPath"),
    surfaces,
  };
}

function parseSections(source: string): Map<string, string> {
  const sections = new Map<string, string>();
  const sectionPattern = /^## (commands|source-delta|script|proof)\s*\n```[^\n]*\n([\s\S]*?)\n```/gm;
  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(source)) !== null) {
    sections.set(match[1]!, match[2] ?? "");
  }
  return sections;
}

function stringField(values: Record<string, string | string[]>, key: string): string | undefined {
  const value = values[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function stripQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
