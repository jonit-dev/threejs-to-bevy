import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const ignoredDirs = new Set([
  ".git",
  ".next",
  ".turbo",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

const sourceExtensions = new Set([".rs", ".ts", ".tsx"]);

const defaultOptions = {
  maxBlockLines: 350,
  maxFileLines: 1200,
  maxTestFileLines: 1800,
  repoRoot,
};

export async function checkSourceSize(options = {}) {
  const config = { ...defaultOptions, ...options };
  const files = await collectSourceFiles(config.repoRoot);
  const diagnostics = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const path = normalizePath(relative(config.repoRoot, file));
    const lines = countLines(content);
    const maxLines = isTestPath(path) ? config.maxTestFileLines : config.maxFileLines;

    if (lines > maxLines) {
      diagnostics.push({
        code: "TN_SOURCE_SIZE_FILE_LINES",
        lineCount: lines,
        maxLines,
        message: `${path} has ${lines} lines, above the ${maxLines}-line warning threshold. Consider splitting responsibilities before adding more behavior.`,
        path,
        severity: "warning",
      });
    }

    for (const block of findLargeBlocks(content, path, config.maxBlockLines)) {
      diagnostics.push(block);
    }
  }

  diagnostics.sort((left, right) => {
    if (right.lineCount !== left.lineCount) {
      return right.lineCount - left.lineCount;
    }
    return left.path.localeCompare(right.path);
  });

  return {
    code: diagnostics.length === 0 ? "TN_SOURCE_SIZE_WARNINGS_NONE" : "TN_SOURCE_SIZE_WARNINGS",
    diagnostics,
    ok: true,
    status: diagnostics.length === 0 ? "pass" : "warning",
    summary: {
      filesScanned: files.length,
      warnings: diagnostics.length,
      thresholds: {
        maxBlockLines: config.maxBlockLines,
        maxFileLines: config.maxFileLines,
        maxTestFileLines: config.maxTestFileLines,
      },
    },
  };
}

async function collectSourceFiles(root) {
  const files = [];
  await walk(root, files);
  return files.sort();
}

async function walk(directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        await walk(resolve(directory, entry.name), files);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const file = resolve(directory, entry.name);
    const extension = extname(entry.name);
    if (!sourceExtensions.has(extension) || entry.name.endsWith(".d.ts")) {
      continue;
    }
    files.push(file);
  }
}

function findLargeBlocks(content, path, maxLines) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    return findBlocks(content, path, maxLines, /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g, "class", "typescript");
  }
  if (path.endsWith(".rs")) {
    return [
      ...findBlocks(content, path, maxLines, /\b(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][\w]*)/g, "type", "rust"),
      ...findBlocks(content, path, maxLines, /\bimpl(?:\s*<[^>{}]*>)?\s+([A-Za-z_][\w]*(?:::[A-Za-z_][\w]*)?)/g, "impl", "rust"),
    ];
  }
  return [];
}

function findBlocks(content, path, maxLines, pattern, kind, language) {
  const diagnostics = [];
  for (const match of content.matchAll(pattern)) {
    const openBrace = content.indexOf("{", match.index ?? 0);
    if (openBrace === -1) {
      continue;
    }
    const closeBrace = findMatchingBrace(content, openBrace, language);
    if (closeBrace === -1) {
      continue;
    }
    const startLine = countLines(content.slice(0, match.index));
    const lineCount = countLines(content.slice(match.index, closeBrace + 1));
    if (lineCount <= maxLines) {
      continue;
    }
    const name = match[1] ?? "anonymous";
    diagnostics.push({
      code: "TN_SOURCE_SIZE_BLOCK_LINES",
      kind,
      line: startLine,
      lineCount,
      maxLines,
      message: `${path}:${startLine} ${kind} '${name}' spans ${lineCount} lines, above the ${maxLines}-line warning threshold. This is a likely SRP review candidate.`,
      name,
      path: `${path}:${startLine}`,
      severity: "warning",
    });
  }
  return diagnostics;
}

function findMatchingBrace(content, openBrace, language) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openBrace; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1] ?? "";

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote.length > 0) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (isStringQuote(char, language)) {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function isStringQuote(char, language) {
  if (language === "rust") {
    return char === "\"";
  }
  return char === "\"" || char === "'" || char === "`";
}

function countLines(content) {
  if (content.length === 0) {
    return 0;
  }
  return content.split(/\r?\n/).length;
}

function isTestPath(path) {
  return /(?:^|[/.])(?:test|spec)\.[cm]?[jt]sx?$/.test(path) || path.includes(`${sep}tests${sep}`) || path.includes("/tests/");
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function readNumberFlag(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readStringFlag(args, name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const result = await checkSourceSize({
    maxBlockLines: readNumberFlag(args, "--max-block-lines", defaultOptions.maxBlockLines),
    maxFileLines: readNumberFlag(args, "--max-file-lines", defaultOptions.maxFileLines),
    maxTestFileLines: readNumberFlag(args, "--max-test-file-lines", defaultOptions.maxTestFileLines),
    repoRoot: resolve(readStringFlag(args, "--root", defaultOptions.repoRoot)),
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.diagnostics.length === 0) {
    process.stdout.write(`Source size scan passed: ${result.summary.filesScanned} files scanned, 0 warnings.\n`);
    return;
  }

  process.stdout.write(`Source size scan found ${result.diagnostics.length} warning(s); exit code remains 0.\n`);
  for (const diagnostic of result.diagnostics) {
    process.stdout.write(`warning ${diagnostic.code}: ${diagnostic.message}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
