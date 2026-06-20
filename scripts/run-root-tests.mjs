import { spawnSync } from "node:child_process";

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const runIndex = forwardedArgs.indexOf("--run");
const runPattern = runIndex === -1 ? undefined : forwardedArgs[runIndex + 1];
if (runIndex !== -1) {
  forwardedArgs.splice(runIndex, runPattern === undefined ? 1 : 2);
}

const workspaceArgs = ["-r", "--if-present", "test", ...(runPattern === undefined ? [] : ["--", "--run", runPattern]), ...forwardedArgs];
const scriptTestArgs = ["--test", ...(runPattern === undefined ? [] : ["--test-name-pattern", runPattern]), "scripts/*.test.mjs", ...forwardedArgs];
const cargoArgs = ["test", "--manifest-path", "runtime-bevy/Cargo.toml", ...(runPattern === undefined ? [] : [runPattern]), ...forwardedArgs];

for (const [command, args] of [
  ["pnpm", workspaceArgs],
  [process.execPath, scriptTestArgs],
  ["cargo", cargoArgs],
]) {
  const result = spawnSync(command, args, { shell: command === process.execPath, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
