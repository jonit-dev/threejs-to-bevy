import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const packageOrder = [
  ["@threenative/sdk", "packages/sdk"],
  ["@threenative/ir", "packages/ir"],
  ["@threenative/ui", "packages/ui"],
  ["@threenative/r3f", "packages/r3f"],
  ["@threenative/compiler", "packages/compiler"],
  ["@threenative/runtime-web-three", "packages/runtime-web-three"],
  ["@threenative/cli", "packages/cli"],
];

const workspaceFilters = packageOrder.flatMap(([name]) => ["--filter", name]);
const workRoot = await mkdtemp(join(tmpdir(), "threenative-distribution-"));
const packDir = join(workRoot, "packs");
const consumerDir = join(workRoot, "consumer");
const gameDir = join(consumerDir, "simple-game");

const tarballs = new Map();

try {
  await run("pnpm", [...workspaceFilters, "build"], { cwd: repoRoot });
  await run("mkdir", ["-p", packDir], { cwd: repoRoot });

  for (const [name, packagePath] of packageOrder) {
    const before = new Set(await listTgz(packDir));
    await run("pnpm", ["--dir", packagePath, "pack", "--pack-destination", packDir], { cwd: repoRoot });
    const after = await listTgz(packDir);
    const created = after.find((file) => !before.has(file));
    if (created === undefined) {
      throw new Error(`Could not find packed tarball for ${name}.`);
    }
    tarballs.set(name, join(packDir, created));
  }

  await run("mkdir", ["-p", consumerDir], { cwd: repoRoot });
  await run("npm", ["init", "-y"], { cwd: consumerDir });
  await run("npm", ["install", ...[...tarballs.values()]], { cwd: consumerDir });
  await run("npx", ["tn", "create", "simple-game", "--json"], { cwd: consumerDir });

  await rewriteGameDependencies(gameDir, tarballs);
  await run("npm", ["install"], { cwd: gameDir });
  await run("npm", ["run", "build"], { cwd: gameDir });
  await run("npx", ["playwright", "install", "chromium"], { cwd: gameDir });
  await run("npm", ["run", "verify", "--", "--json"], { cwd: gameDir });

  const preview = await startPreview(gameDir);
  try {
    const root = await fetchText(preview.url);
    if (!root.includes("ThreeNative Web Preview") || !root.includes("/dist/browser/main.js")) {
      throw new Error("Preview root did not include the packaged ThreeNative browser shell.");
    }

    const manifest = JSON.parse(await fetchText(new URL("/bundle/manifest.json", preview.url)));
    if (manifest.schema !== "threenative.bundle") {
      throw new Error(`Preview bundle manifest had unexpected schema '${manifest.schema ?? ""}'.`);
    }
  } finally {
    await preview.close();
  }

  const reportPath = join(gameDir, "artifacts", "verify", "verification-report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const result = {
    bundlePath: join(gameDir, "dist", "game.bundle"),
    consumerDir,
    previewVerified: true,
    reportPath,
    status: report.status,
    tarballs: Object.fromEntries([...tarballs].map(([name, path]) => [name, basename(path)])),
  };

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`Work directory preserved for inspection: ${workRoot}`);
  process.exitCode = 1;
}

async function listTgz(dir) {
  try {
    return (await readdir(dir)).filter((file) => file.endsWith(".tgz")).sort();
  } catch {
    return [];
  }
}

async function rewriteGameDependencies(projectDir, packageTarballs) {
  const packageJsonPath = join(projectDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.dependencies = {
    ...packageJson.dependencies,
    "@threenative/sdk": `file:${packageTarballs.get("@threenative/sdk")}`,
    "@threenative/ir": `file:${packageTarballs.get("@threenative/ir")}`,
    "@threenative/ui": `file:${packageTarballs.get("@threenative/ui")}`,
    "@threenative/r3f": `file:${packageTarballs.get("@threenative/r3f")}`,
    "@threenative/compiler": `file:${packageTarballs.get("@threenative/compiler")}`,
    "@threenative/runtime-web-three": `file:${packageTarballs.get("@threenative/runtime-web-three")}`,
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@threenative/cli": `file:${packageTarballs.get("@threenative/cli")}`,
  };
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}.`);
  }
  return await response.text();
}

async function startPreview(cwd) {
  const child = spawn("npm", ["run", "dev:web", "--", "--json"], {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const url = await waitForPreviewUrl(child, () => stdout, () => stderr);
  return {
    close: async () => {
      child.kill("SIGINT");
      await new Promise((resolveClose) => {
        child.once("exit", () => resolveClose());
        setTimeout(resolveClose, 2000);
      });
    },
    url,
  };
}

async function waitForPreviewUrl(child, getStdout, getStderr) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (child.exitCode !== null) {
      throw new Error(`Preview exited before ready.\n${getStdout()}\n${getStderr()}`);
    }

    const match = getStdout().match(/"url":\s*"([^"]+)"/);
    if (match?.[1] !== undefined) {
      return match[1];
    }
    await sleep(100);
  }

  child.kill("SIGINT");
  throw new Error(`Timed out waiting for preview URL.\n${getStdout()}\n${getStderr()}`);
}

async function run(command, args, options) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
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

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
