import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const forbiddenPatterns = [
  /\buseState\b/,
  /\buseReducer\b/,
  /\bcreateContext\b/,
];

test("should keep editor session state inside the Zustand store", async () => {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const srcRoot = join(packageRoot, "src");
  const files = await listFiles(srcRoot);
  const violations: string[] = [];

  for (const file of files) {
    if (!file.endsWith(".tsx")) {
      continue;
    }
    const source = await readFile(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relative(srcRoot, file)} uses ${pattern.source.replaceAll("\\b", "")}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Editor session state must live in packages/editor/src/state/editorStore.ts. Violations:\n${violations.join("\n")}`,
  );
});

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}
