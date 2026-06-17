import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = resolve(packageRoot, "..", "..");
const sourceTemplates = resolve(repoRoot, "templates");
const outputTemplates = resolve(packageRoot, "dist", "templates");

await rm(outputTemplates, { force: true, recursive: true });
await cp(sourceTemplates, outputTemplates, {
  recursive: true,
  filter: (source) => {
    const relative = source.slice(sourceTemplates.length + 1);
    const parts = relative.split("/");
    return !parts.includes("node_modules") && !parts.includes("dist") && !parts.includes("artifacts");
  },
});
