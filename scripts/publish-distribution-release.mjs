import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageOrder = [
  ["@threenative/sdk", "packages/sdk"],
  ["@threenative/ir", "packages/ir"],
  ["@threenative/ui", "packages/ui"],
  ["@threenative/r3f", "packages/r3f"],
  ["@threenative/compiler", "packages/compiler"],
  ["@threenative/runtime-web-three", "packages/runtime-web-three"],
  ["@threenative/cli", "packages/cli"],
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipBuild = args.has("--skip-build");
const skipTests = args.has("--skip-tests");
const userConfig = readValueFlag("--userconfig");
const otp = readValueFlag("--otp");
const packDir = readValueFlag("--pack-dir") ?? await mkdtemp(join(tmpdir(), "threenative-publish-"));
const workspaceFilters = packageOrder.flatMap(([name]) => ["--filter", name]);
const tarballs = [];

try {
  if (!skipTests) {
    await run("pnpm", ["verify"], { cwd: repoRoot });
    await run("pnpm", ["verify:distribution"], { cwd: repoRoot });
  } else if (!skipBuild) {
    await run("pnpm", [...workspaceFilters, "build"], { cwd: repoRoot });
  }

  await run("mkdir", ["-p", packDir], { cwd: repoRoot });

  for (const [name, packagePath] of packageOrder) {
    const expectedTarball = await readExpectedTarball(packagePath);
    await rm(join(packDir, expectedTarball), { force: true });
    await run("pnpm", ["--dir", packagePath, "pack", "--pack-destination", packDir], { cwd: repoRoot });
    try {
      await access(join(packDir, expectedTarball));
    } catch {
      throw new Error(`Could not find packed tarball for ${name}.`);
    }
    tarballs.push([name, join(packDir, expectedTarball)]);
  }

  const env = { ...process.env };
  if (userConfig !== undefined) {
    env.NPM_CONFIG_USERCONFIG = userConfig;
  }

  for (const [name, tarball] of tarballs) {
    console.log(`${dryRun ? "Dry-run publishing" : "Publishing"} ${name} from ${basename(tarball)}`);
    await run("npm", [
      "publish",
      tarball,
      "--access",
      "public",
      ...(dryRun ? ["--dry-run"] : []),
      ...(otp === undefined ? [] : ["--otp", otp]),
    ], {
      cwd: repoRoot,
      env,
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        packDir,
        skippedTests: skipTests,
        published: tarballs.map(([name, tarball]) => ({ name, tarball: basename(tarball) })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`Pack directory preserved for inspection: ${packDir}`);
  process.exitCode = 1;
}

function readValueFlag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readExpectedTarball(packagePath) {
  const packageJson = JSON.parse(await readFile(join(repoRoot, packagePath, "package.json"), "utf8"));
  const name = packageJson.name.replace(/^@/, "").replace("/", "-");
  return `${name}-${packageJson.version}.tgz`;
}

async function run(command, args, options) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}.`));
    });
  });
}
