import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function checkArtifactLayout(options = {}) {
  const root = options.root ?? repoRoot;
  const diagnostics = [];
  const files = await walkAllFiles(root, root);

  for (const relativePath of files) {
    if (relativePath.startsWith("artifacts/")) {
      diagnostics.push(...diagnoseRootArtifactPath(relativePath));
      continue;
    }

    if (/^tmp\/.*\/artifacts\//.test(relativePath)) {
      diagnostics.push({
        code: "TN_ARTIFACT_LAYOUT_TMP_ARTIFACT",
        path: relativePath,
        message: `Temporary artifact '${relativePath}' must stay ignored and must not be referenced by release gates.`,
        severity: "error",
      });
      continue;
    }

    if (/^templates\/[^/]+\/artifacts\//.test(relativePath)) {
      diagnostics.push({
        code: "TN_ARTIFACT_LAYOUT_TEMPLATE_GENERATED_ARTIFACT",
        path: relativePath,
        message: `Generated template artifact '${relativePath}' must move to templates/<name>/fixtures/* if it is an intentional checked-in input.`,
        severity: "error",
      });
    }
  }

  diagnostics.push(...(await collectAgentGuidanceDiagnostics(root)));
  return {
    diagnostics,
    ok: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length === 0,
  };
}

function diagnoseRootArtifactPath(relativePath) {
  return [
    {
      code: /^artifacts\/v[0-9]/.test(relativePath) || /^artifacts\/[^/]*v[0-9]/.test(relativePath)
        ? "TN_ARTIFACT_LAYOUT_VERSIONED_ROOT_ARTIFACT"
        : "TN_ARTIFACT_LAYOUT_ROOT_ARTIFACT",
      path: relativePath,
      message: `Root artifact '${relativePath}' is not allowed. Use examples/<name>/artifacts/<gate>/ for example evidence, packages/ir/artifacts/conformance/ for IR conformance, tools/verify/artifacts/<gate>/ for verifier-owned reports, or runtime-bevy/artifacts/<gate>/ for Bevy-only evidence.`,
      severity: "error",
    },
  ];
}

async function collectAgentGuidanceDiagnostics(root) {
  const diagnostics = [];
  for (const relativePath of ["AGENTS.md", "examples/AGENTS.md", "packages/AGENTS.md", "runtime-bevy/AGENTS.md"]) {
    const absolutePath = join(root, relativePath);
    let content = "";
    try {
      content = await readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    if (content.length > 12000 || content.includes("## 1. Context") || content.includes("Surface Area Inventory")) {
      diagnostics.push({
        code: "TN_ARTIFACT_LAYOUT_AGENTS_POLICY_DUPLICATED",
        path: relativePath,
        message: `${relativePath} should contain concise local layout guidance and link to docs instead of duplicating the layout PRD.`,
        severity: "error",
      });
    }
  }
  return diagnostics;
}

async function walkAllFiles(rootDir, currentDir, files = []) {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "target" || entry.name === "dist") {
      continue;
    }
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkAllFiles(rootDir, absolutePath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(relative(rootDir, absolutePath).replaceAll("\\", "/"));
    }
  }
  return files;
}

export async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const result = await checkArtifactLayout();
  if (result.ok) {
    process.stdout.write("Artifact layout passed.\n");
  } else {
    process.stdout.write(
      `Artifact layout failed with ${result.diagnostics.length} issue(s).\n${result.diagnostics
        .map((diagnostic) => `${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`)
        .join("\n")}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
