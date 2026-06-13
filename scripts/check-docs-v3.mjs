import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function checkDocsV3(root = repoRoot) {
  const files = [
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
  const exampleReadme = await readFile(resolve(root, "examples/v3-environment/README.md"), "utf8");
  for (const required of ["dist/forest.bundle", "assets/environment", "performance"]) {
    if (!exampleReadme.includes(required)) {
      diagnostics.push({ code: "TN_DOCS_V3_ARTIFACT_MISSING", file: "examples/v3-environment/README.md", message: `Missing V3 artifact documentation for '${required}'.` });
    }
  }
  return { diagnostics, ok: diagnostics.length === 0 };
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
