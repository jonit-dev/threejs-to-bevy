import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const v4ScopeFiles = [
  "docs/PRDs/v4/README.md",
  "docs/ROADMAP.md",
  "docs/scripting.md",
  "docs/scripting-api.md",
  "docs/feature-maturity.md",
];

const requiredTerms = [
  "QuickJS",
  "scripts.bundle.js",
  "patch",
  "event",
  "command",
  "primitive",
];

const excludedAcceptanceTerms = [
  { name: "public Lua/Luau", pattern: /\b(public\s+)?Lua\b|\b(public\s+)?Luau\b/i },
  { name: "arbitrary npm", pattern: /\barbitrary npm\b/i },
  { name: "async systems", pattern: /\basync systems?\b|\basync\/await\b/i },
  { name: "full physics", pattern: /\bfull physics\b/i },
  { name: "full UI runtime", pattern: /\bfull UI runtime\b|\bfull portable UI\b/i },
];

export async function checkDocsV4(root = repoRoot) {
  const diagnostics = [];
  const indexPath = "docs/PRDs/v4/README.md";
  const indexText = await readFile(resolve(root, indexPath), "utf8");

  for (const file of v4ScopeFiles) {
    const text = await readFile(resolve(root, file), "utf8");
    for (const required of requiredTerms) {
      if (!text.toLowerCase().includes(required.toLowerCase())) {
        diagnostics.push({
          code: "TN_DOCS_V4_SCOPE_TERM_MISSING",
          file,
          message: `V4 scope doc is missing required term '${required}'.`,
        });
      }
    }
  }

  const v4Dir = resolve(root, "docs/PRDs/v4");
  const prdFiles = (await readdir(v4Dir))
    .filter((file) => /^V4-\d+-.+\.md$/.test(file))
    .sort((left, right) => left.localeCompare(right));
  for (const file of prdFiles) {
    if (!indexText.includes(`./${file}`)) {
      diagnostics.push({
        code: "TN_DOCS_V4_INDEX_LINK_MISSING",
        file: indexPath,
        message: `V4 PRD index does not link '${file}'.`,
      });
    }
  }

  const acceptance = sectionBetween(indexText, "## V4 Acceptance Criteria", "## Release Gate");
  for (const excluded of excludedAcceptanceTerms) {
    if (excluded.pattern.test(acceptance)) {
      diagnostics.push({
        code: "TN_DOCS_V4_EXCLUDED_ACCEPTANCE_SCOPE",
        file: indexPath,
        message: `V4 acceptance criteria includes excluded capability '${excluded.name}'.`,
      });
    }
  }

  const packageJson = await readFile(resolve(root, "package.json"), "utf8");
  if (!packageJson.includes('"check:docs:v4"')) {
    diagnostics.push({
      code: "TN_DOCS_V4_SCRIPT_MISSING",
      file: "package.json",
      message: "package.json must define check:docs:v4.",
    });
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

function sectionBetween(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start === -1) {
    return "";
  }
  const end = text.indexOf(endHeading, start + startHeading.length);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkDocsV4();
  const payload = {
    code: result.ok ? "TN_DOCS_V4_OK" : "TN_DOCS_V4_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V4 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V4 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
        .map((diagnostic) => `${diagnostic.code} ${diagnostic.file}: ${diagnostic.message}`)
        .join("\n")}\n`,
    );
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
