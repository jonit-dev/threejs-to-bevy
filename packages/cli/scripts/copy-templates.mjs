import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = resolve(packageRoot, "..", "..");
const sourceTemplates = resolve(repoRoot, "templates");
const outputTemplates = resolve(packageRoot, "dist", "template-files");
const sourceBevyRuntime = resolve(repoRoot, "runtime-bevy");
const outputBevyRuntime = resolve(packageRoot, "dist", "runtime-bevy");

await rm(outputTemplates, { force: true, recursive: true });
await cp(sourceTemplates, outputTemplates, {
  recursive: true,
  filter: (source) => {
    const relative = source.slice(sourceTemplates.length + 1);
    const parts = relative.split("/");
    return !parts.includes("node_modules") && !parts.includes("dist") && !parts.includes("artifacts");
  },
});

await rm(outputBevyRuntime, { force: true, recursive: true });
await cp(sourceBevyRuntime, outputBevyRuntime, {
  recursive: true,
  filter: (source) => {
    const relative = source.slice(sourceBevyRuntime.length + 1);
    const parts = relative.split("/");
    return !parts.includes("target") && !parts.includes("artifacts") && !parts.includes("examples") && !parts.includes(".git");
  },
});
