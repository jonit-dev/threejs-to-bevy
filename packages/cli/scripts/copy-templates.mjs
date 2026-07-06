import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = resolve(packageRoot, "..", "..");
const sourceTemplates = resolve(repoRoot, "templates");
const outputTemplates = resolve(packageRoot, "dist", "template-files");
const sourceBevyRuntime = resolve(repoRoot, "runtime-bevy");
const outputBevyRuntime = resolve(packageRoot, "dist", "runtime-bevy");
const outputAiDocs = resolve(packageRoot, "dist", "ai");

const cleanGeneratedDirectory = async (path) => {
  await rm(path, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
};

await cleanGeneratedDirectory(outputTemplates);
await cp(sourceTemplates, outputTemplates, {
  recursive: true,
  filter: (source) => {
    const relative = source.slice(sourceTemplates.length + 1);
    const parts = relative.split("/");
    return !parts.includes("node_modules") && !parts.includes("dist") && !parts.includes("artifacts");
  },
});

await cleanGeneratedDirectory(outputBevyRuntime);
await cp(sourceBevyRuntime, outputBevyRuntime, {
  recursive: true,
  filter: (source) => {
    const relative = source.slice(sourceBevyRuntime.length + 1);
    const parts = relative.split("/");
    return !parts.includes("target") && !parts.includes("artifacts") && !parts.includes("examples") && !parts.includes(".git");
  },
});

await cleanGeneratedDirectory(outputAiDocs);
await mkdir(resolve(outputAiDocs, "docs", "workflows"), { recursive: true });
await cp(resolve(repoRoot, "llms.txt"), resolve(outputAiDocs, "llms.txt"));
await cp(resolve(repoRoot, "llms-full.txt"), resolve(outputAiDocs, "llms-full.txt"));
await cp(resolve(repoRoot, "docs", "workflows", "ai-distribution.md"), resolve(outputAiDocs, "docs", "workflows", "ai-distribution.md"));
