import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const requiredBundleNames = ["ui.ir.json", "input.ir.json", "assets.manifest.json"];
const scopeDocPaths = [
  "docs/sdk.md",
  "docs/ecs.md",
  "docs/ir.md",
  "docs/scripting.md",
  "docs/runtime-adapters.md",
];
const bundleNameRequirements = [
  {
    file: "docs/PRDs/v2/README.md",
    names: requiredBundleNames,
  },
  {
    file: "docs/ir.md",
    names: requiredBundleNames,
  },
  {
    file: "docs/sdk.md",
    names: ["ui.ir.json", "input.ir.json", "assets.manifest.json"],
  },
  {
    file: "docs/runtime-adapters.md",
    names: ["ui.ir.json", "input.ir.json", "assets.manifest.json"],
  },
];
const conformanceGuidanceRequirements = [
  {
    file: "AGENTS.md",
    phrases: ["verify:conformance", "self-verification", "regression"],
  },
  {
    file: "docs/developer-workflow.md",
    phrases: ["verify:conformance", "shared conformance", "semantic reports"],
  },
  {
    file: "docs/runtime-adapters.md",
    phrases: ["verify:conformance", "Semantic parity", "Pixel-perfect visual parity is not the V2 goal"],
  },
  {
    file: "docs/PRDs/v2/README.md",
    phrases: ["verify:conformance", "shared fixtures"],
  },
];

const v3OnlyCapabilities = [
  { name: "gamepad", pattern: /\bgamepads?\b/i },
  { name: "prefab", pattern: /\bprefabs?\b/i },
  { name: "changed queries", pattern: /\bchanged[- ]query\b|\bchanged queries\b|\bchanged semantics\b/i },
  { name: "MCP", pattern: /\bMCP\b/ },
  { name: "profiling", pattern: /\bprofiling\b|\bprofile reports?\b/i },
  { name: "mobile packaging", pattern: /\bmobile packaging\b|\bAndroid\b|\biOS\b/i },
];

export async function checkDocsV2(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const diagnostics = [];
  const v2Dir = resolve(root, "docs/PRDs/v2");
  const v2Docs = await markdownFiles(v2Dir);
  const scopeDocs = [
    ...v2Docs,
    ...scopeDocPaths.map((filePath) => resolve(root, filePath)),
  ];
  const v2ReadmePath = resolve(v2Dir, "README.md");
  const v2Readme = await readFile(v2ReadmePath, "utf8");

  for (const filePath of v2Docs.filter((filePath) => /V2-\d+-/.test(filePath))) {
    const ticketName = filePath.slice(v2Dir.length + 1);
    if (!v2Readme.includes(`./${ticketName}`)) {
      diagnostics.push({
        code: "TN_DOCS_V2_TICKET_LINK_MISSING",
        file: "docs/PRDs/v2/README.md",
        message: `V2 README must link '${ticketName}'.`,
      });
    }
  }

  for (const { file, names } of bundleNameRequirements) {
    const text = await readFile(resolve(root, file), "utf8");
    for (const bundleName of names) {
      if (!text.includes(bundleName)) {
        diagnostics.push({
          code: "TN_DOCS_V2_BUNDLE_NAME_MISSING",
          file,
          message: `V2 docs must name '${bundleName}' consistently in ${file}.`,
        });
      }
    }
  }

  for (const { file, phrases } of conformanceGuidanceRequirements) {
    const text = await readFile(resolve(root, file), "utf8");
    for (const phrase of phrases) {
      if (!text.includes(phrase)) {
        diagnostics.push({
          code: "TN_DOCS_V2_CONFORMANCE_GUIDANCE_MISSING",
          file,
          message: `V2 docs must include conformance guidance phrase '${phrase}' in ${file}.`,
        });
      }
    }
  }

  for (const filePath of scopeDocs) {
    const lines = (await readFile(filePath, "utf8")).split("\n");
    for (const { name, pattern } of v3OnlyCapabilities) {
      const lineIndex = lines.findIndex(
        (line) => pattern.test(line) && isRequiredV2ScopeLine(line) && !isAllowedDeferredScopeLine(line),
      );
      if (lineIndex !== -1) {
        diagnostics.push({
          code: "TN_DOCS_V2_SCOPE_DRIFT",
          file: relative(root, filePath),
          message: `V3-only capability '${name}' appears to be required V2 scope on line ${lineIndex + 1}.`,
        });
      }
    }
  }

  const allDocs = await markdownFiles(resolve(root, "docs"));
  for (const filePath of allDocs) {
    const text = await readFile(filePath, "utf8");
    if (/\basset\.manifest\.json\b/.test(text)) {
      diagnostics.push({
        code: "TN_DOCS_V2_ASSET_MANIFEST_NAME",
        file: relative(root, filePath),
        message: "Use assets.manifest.json, not asset.manifest.json.",
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

function isRequiredV2ScopeLine(line) {
  return /\bV2\b.*\b(requires?|must|release gate|gate|supports?|scope includes|required)\b|\b(requires?|must|release gate|gate|supports?|scope includes|required)\b.*\bV2\b/i.test(
    line,
  );
}

function isAllowedDeferredScopeLine(line) {
  return /V3|post-V2|after V2|excluded from V2|out of V2|not required|not a V2 gate|non-blocking|optional|unless explicitly|unless declared|defer|reject|unsupported/i.test(
    line,
  );
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkDocsV2();
  const payload = {
    code: result.ok ? "TN_DOCS_V2_OK" : "TN_DOCS_V2_FAILED",
    diagnostics: result.diagnostics,
    status: result.ok ? "pass" : "fail",
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V2 docs consistency passed.\n");
  } else {
    process.stderr.write(
      `V2 docs consistency failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
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
