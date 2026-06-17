import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const legacyScript = process.argv[2];
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

if (!legacyScript) {
  process.stderr.write("Usage: node scripts/legacy-script-alias.mjs <legacy-script-name>\n");
  process.exitCode = 1;
} else {
  spawnSync("pnpm", ["--filter", "@threenative/verify-tools", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  const tools = await import(new URL("../tools/verify/dist/legacyAliases.js", import.meta.url).href);
  process.exitCode = tools.runLegacyScriptAlias(legacyScript, process.argv.slice(3));
}
