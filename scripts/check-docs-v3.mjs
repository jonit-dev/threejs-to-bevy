import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function checkDocsV3(root = repoRoot) {
  const files = [
    "docs/STATUS.md",
    "docs/README.md",
    "docs/releases/v3-completion.md",
    "docs/conventions.md",
    "docs/feature-maturity.md",
    "docs/verify-v3.md",
    "docs/diagnostics.md",
    "docs/v3/environment-scene-ir.md",
    "docs/v3/asset-pipeline.md",
    "docs/v3/visual-parity-policy.md",
    "docs/PRDs/v3/README.md",
    "docs/PRDs/v3/V3-02-threejs-performance-and-instancing.md",
    "examples/v3-environment/README.md",
  ];
  const diagnostics = [];
  for (const file of files) {
    const text = await readFile(resolve(root, file), "utf8");
    if (!text.includes("v3") && !text.includes("V3")) {
      diagnostics.push({ code: "TN_DOCS_V3_SCOPE_MISSING", file, message: "Document does not mention V3 scope." });
    }
  }
  const indexPath = "docs/PRDs/v3/README.md";
  const indexText = await readFile(resolve(root, indexPath), "utf8");
  const docsReadmePath = "docs/README.md";
  const docsReadme = await readFile(resolve(root, docsReadmePath), "utf8");
  if (!docsReadme.includes("STATUS.md")) {
    diagnostics.push({ code: "TN_DOCS_V3_STATUS_LINK_MISSING", file: docsReadmePath, message: "Docs README must link STATUS.md." });
  }
  if (/V1 is the current implemented release candidate path/i.test(docsReadme)) {
    diagnostics.push({ code: "TN_DOCS_V3_STALE_STATUS", file: docsReadmePath, message: "Docs README still claims V1 is the current release candidate path." });
  }
  for (const required of ["docs/releases/v3-completion.md", "docs/conventions.md", "docs/feature-maturity.md", "docs/verify-v3.md"]) {
    if (!docsReadme.includes(required.replace("docs/", "")) && !docsReadme.includes(required)) {
      diagnostics.push({ code: "TN_DOCS_V3_FRONT_DOOR_LINK_MISSING", file: docsReadmePath, message: `Docs README does not link '${required}'.` });
    }
  }
  const statusText = await readFile(resolve(root, "docs/STATUS.md"), "utf8");
  for (const required of ["V3", "pnpm verify:v3", "V3 Does Not Prove"]) {
    if (!statusText.includes(required)) {
      diagnostics.push({ code: "TN_DOCS_V3_STATUS_TERM_MISSING", file: "docs/STATUS.md", message: `STATUS.md is missing '${required}'.` });
    }
  }
  const v3Dir = resolve(root, "docs/PRDs/v3");
  const prdFiles = (await readdir(v3Dir))
    .filter((file) => /^V3-\d+-.+\.md$/.test(file))
    .sort((left, right) => left.localeCompare(right));
  for (const file of prdFiles) {
    if (!indexText.includes(`./${file}`)) {
      diagnostics.push({ code: "TN_DOCS_V3_INDEX_LINK_MISSING", file: indexPath, message: `V3 PRD index does not link '${file}'.` });
    }
  }
  for (const required of ["Preview_2.jpg", "Three.js", "performance", "first-person", "Bevy", "verify:v3"]) {
    if (!indexText.toLowerCase().includes(required.toLowerCase())) {
      diagnostics.push({ code: "TN_DOCS_V3_SCOPE_TERM_MISSING", file: indexPath, message: `V3 PRD index is missing required scope term '${required}'.` });
    }
  }
  const acceptance = sectionBetween(indexText, "## V3 Acceptance Criteria", "## Release Gate");
  for (const excluded of ["mobile", "MCP", "visual editor", "multiplayer", "custom shaders", "production template catalog"]) {
    if (acceptance.toLowerCase().includes(excluded.toLowerCase())) {
      diagnostics.push({ code: "TN_DOCS_V3_EXCLUDED_GATE", file: indexPath, message: `V3 acceptance criteria includes excluded capability '${excluded}'.` });
    }
  }
  const exampleReadme = await readFile(resolve(root, "examples/v3-environment/README.md"), "utf8");
  for (const required of ["dist/forest.bundle", "assets/environment", "performance", "threejs-bevy-side-by-side.png"]) {
    if (!exampleReadme.includes(required)) {
      diagnostics.push({ code: "TN_DOCS_V3_ARTIFACT_MISSING", file: "examples/v3-environment/README.md", message: `Missing V3 artifact documentation for '${required}'.` });
    }
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
  const result = await checkDocsV3();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.ok ? "TN_DOCS_V3_OK" : "TN_DOCS_V3_FAILED", ...result }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V3 docs check passed.\n");
  } else {
    process.stderr.write(`${result.diagnostics[0]?.message ?? "V3 docs check failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
