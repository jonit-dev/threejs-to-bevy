import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { resolvePublishVersions } from "./publish-versioning.mjs";
import { packageOrder } from "./distribution-packages.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const noAutoBump = args.has("--no-auto-bump");
const skipBuild = args.has("--skip-build");
const skipTests = args.has("--skip-tests");
const userConfig = readValueFlag("--userconfig");
const otp = readValueFlag("--otp");
const packDir = readValueFlag("--pack-dir") ?? await mkdtemp(join(tmpdir(), "threenative-publish-"));
const workspaceFilters = packageOrder.flatMap(([name]) => ["--filter", name]);
const tarballs = [];
const env = { ...process.env };
if (userConfig !== undefined) {
  env.NPM_CONFIG_USERCONFIG = userConfig;
}

try {
  if (!dryRun && !noAutoBump) {
    await autoBumpPublishedVersions(env);
  }

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
    const packageJson = await readPackageJson(packagePath);
    tarballs.push([name, join(packDir, expectedTarball), packageJson.version]);
  }

  for (const [name, tarball, version] of tarballs) {
    if (dryRun && (await isPublishedVersion(name, version, env))) {
      console.log(`Dry-run skipping ${name}@${version}; version is already published.`);
      continue;
    }
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
        published: tarballs.map(([name, tarball, version]) => ({ name, tarball: basename(tarball), version })),
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
  const packageJson = await readPackageJson(packagePath);
  const name = packageJson.name.replace(/^@/, "").replace("/", "-");
  return `${name}-${packageJson.version}.tgz`;
}

async function readPackageJson(packagePath) {
  return JSON.parse(await readFile(join(repoRoot, packagePath, "package.json"), "utf8"));
}

async function writePackageJson(packagePath, packageJson) {
  await writeFile(join(repoRoot, packagePath, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function autoBumpPublishedVersions(env) {
  const packageManifests = [];
  for (const [name, packagePath] of packageOrder) {
    const packageJson = await readPackageJson(packagePath);
    packageManifests.push({ name, packageJson, packagePath, version: packageJson.version });
  }

  const plan = await resolvePublishVersions(
    packageManifests.map(({ name, version }) => ({ name, version })),
    async (name, version) => await isPublishedVersion(name, version, env),
  );

  if (!plan.bumped) {
    return;
  }

  console.log(`Auto-bumping publishable packages to ${plan.targetVersion}; current version is already published or package versions are not aligned.`);
  for (const manifest of packageManifests) {
    const nextVersion = plan.versions.get(manifest.name);
    if (nextVersion === undefined || manifest.packageJson.version === nextVersion) {
      continue;
    }
    manifest.packageJson.version = nextVersion;
    await writePackageJson(manifest.packagePath, manifest.packageJson);
    console.log(`Updated ${manifest.name} to ${nextVersion}.`);
  }
}

async function isPublishedVersion(name, version, env) {
  const result = await runCapture("npm", ["view", `${name}@${version}`, "version", "--json"], {
    cwd: repoRoot,
    env,
  });
  return result.code === 0 && JSON.parse(result.stdout.trim()) === version;
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

async function runCapture(command, args, options) {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolveRun({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}
