import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function checkDocsV1(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const diagnostics = [];
  const v1Dir = resolve(root, "docs/PRDs/v1");
  const v1Docs = await markdownFiles(v1Dir);
  const allDocs = await markdownFiles(resolve(root, "docs"));

  for (const filePath of v1Docs) {
    const text = await readFile(filePath, "utf8");
    for (const line of text.split("\n")) {
      if (/\b(scene|ecs)\.ir\.json\b/.test(line) && !isAllowedLegacyBundleLine(line)) {
        diagnostics.push({
          code: "TN_DOCS_V1_LEGACY_BUNDLE_NAME",
          file: relative(root, filePath),
          message: "V1 docs must use world.ir.json, not scene.ir.json or ecs.ir.json.",
        });
        break;
      }
    }
  }

  const v1Readme = await readFile(resolve(v1Dir, "README.md"), "utf8");
  const requiredCommands = [
    "tn create",
    "tn validate",
    "tn build",
    "tn dev --target web",
    "tn dev --target desktop",
    "tn verify",
  ];
  for (const command of requiredCommands) {
    if (!v1Readme.includes(command)) {
      diagnostics.push({
        code: "TN_DOCS_V1_COMMAND_MISSING",
        file: "docs/PRDs/v1/README.md",
        message: `V1 command surface is missing '${command}'.`,
      });
    }
  }

  const unsupportedGatePatterns = [
    { pattern: /\btn build --target desktop\b/, reason: "desktop build is post-V1; V1 uses tn dev --target desktop" },
    { pattern: /\bui\.ir\.json\b/, reason: "portable UI IR is post-V1" },
    { pattern: /\bMCP\b/, reason: "MCP is post-V1" },
    { pattern: /\bAndroid\b|\biOS\b|\bmobile\b/i, reason: "mobile targets are post-V1" },
  ];
  for (const filePath of v1Docs) {
    const text = await readFile(filePath, "utf8");
    const lines = text.split("\n");
    for (const { pattern, reason } of unsupportedGatePatterns) {
      if (lines.some((line) => pattern.test(line) && !isAllowedPostV1Line(line))) {
        diagnostics.push({
          code: "TN_DOCS_V1_UNSUPPORTED_GATE",
          file: relative(root, filePath),
          message: `Potential unsupported V1 gate found: ${reason}.`,
        });
      }
    }
  }

  for (const filePath of v1Docs.filter((filePath) => /V1-\d+-/.test(filePath))) {
    const text = await readFile(filePath, "utf8");
    for (const heading of ["## Acceptance Criteria", "**Tests Required:**", "**User Verification:**"]) {
      if (!text.includes(heading)) {
        diagnostics.push({
          code: "TN_DOCS_V1_TICKET_SECTION_MISSING",
          file: relative(root, filePath),
          message: `V1 ticket is missing '${heading}'.`,
        });
      }
    }
  }

  for (const filePath of allDocs) {
    const text = await readFile(filePath, "utf8");
    if (
      text
        .split("\n")
        .some((line) => /V1.+scene\.ir\.json|scene\.ir\.json.+V1/i.test(line) && !isAllowedLegacyBundleLine(line))
    ) {
      diagnostics.push({
        code: "TN_DOCS_V1_LEGACY_BUNDLE_NAME",
        file: relative(root, filePath),
        message: "Docs must not associate V1 with scene.ir.json.",
      });
    }
  }

  return {
    diagnostics,
    ok: diagnostics.length === 0,
  };
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

function relative(root, path) {
  return path.slice(root.length + 1);
}

function isAllowedLegacyBundleLine(line) {
  return /\bnot\b|standardize|replace|legacy|vary|conflicting|grep|fixture with|catch/i.test(line);
}

function isAllowedPostV1Line(line) {
  return /post-V1|out of V1|not a V1 gate|not required for V1|moves to V2|unless promoted|broader|clarify|current docs|current behavior/i.test(
    line,
  );
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkDocsV1();
  const payload = {
    code: result.ok ? "TN_DOCS_V1_OK" : "TN_DOCS_V1_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V1 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V1 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
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
