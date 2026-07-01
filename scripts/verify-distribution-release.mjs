import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { checkDistributionContract } from "./check-distribution-contract.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
export const packageOrder = [
  ["@threenative/sdk", "packages/sdk"],
  ["@threenative/ir", "packages/ir"],
  ["@threenative/authoring", "packages/authoring"],
  ["@threenative/ui", "packages/ui"],
  ["@threenative/r3f", "packages/r3f"],
  ["@threenative/compiler", "packages/compiler"],
  ["@threenative/runtime-web-three", "packages/runtime-web-three"],
  ["@threenative/cli", "packages/cli"],
];

export const requiredAiDocFiles = [
  "llms.txt",
  "llms-full.txt",
  "docs/workflows/ai-distribution.md",
  "examples/ai-reference/README.md",
];

export const requiredIrMetadataFiles = [
  "schemas/assets.schema.json",
  "schemas/input.schema.json",
  "schemas/manifest.schema.json",
  "schemas/materials.schema.json",
  "schemas/overlays.schema.json",
  "schemas/runtime-config.schema.json",
  "schemas/scenes.schema.json",
  "schemas/target-profile.schema.json",
  "schemas/world.schema.json",
  "capabilities/threenative.capabilities.json",
  "diagnostics/diagnostics.catalog.json",
];

export async function runDistributionVerification(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const workspaceFilters = packageOrder.flatMap(([name]) => ["--filter", name]);
  const workRoot = options.workRoot ?? await mkdtemp(join(tmpdir(), "threenative-distribution-"));
  const packDir = join(workRoot, "packs");
  const consumerDir = join(workRoot, "consumer");
  const gameDir = join(consumerDir, "simple-game");
  const releaseVersion = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
  const distributableArchiveName = `threenative-simple-game-desktop-${releaseVersion}.tar.gz`;
  const tarballs = new Map();

  const contract = await checkDistributionContract({ root });
  if (!contract.ok) {
    throw new Error(
      `Distribution contract check failed.\n${contract.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.path}: ${diagnostic.message}`)
        .join("\n")}`,
    );
  }
  await run("pnpm", [...workspaceFilters, "build"], { cwd: root });
  await run("mkdir", ["-p", packDir], { cwd: root });

  for (const [name, packagePath] of packageOrder) {
    const before = new Set(await listTgz(packDir));
    await run("pnpm", ["--dir", packagePath, "pack", "--pack-destination", packDir], { cwd: root });
    const after = await listTgz(packDir);
    const created = after.find((file) => !before.has(file));
    if (created === undefined) {
      throw new Error(`Could not find packed tarball for ${name}.`);
    }
    tarballs.set(name, join(packDir, created));
  }

  await run("mkdir", ["-p", consumerDir], { cwd: root });
  await run("npm", ["init", "-y"], { cwd: consumerDir });
  await run("npm", ["install", ...[...tarballs.values()]], { cwd: consumerDir });
  await verifyInstalledDistributionArtifacts(consumerDir);
  await writeConsumerTypecheckFixture(consumerDir);
  await run("npx", ["tsc", "--noEmit", "--project", "tsconfig.threenative-contract.json"], { cwd: consumerDir });
  await run("npx", ["tn", "create", "simple-game", "--json"], { cwd: consumerDir });
  await verifyGeneratedProjectAgentInstructions(gameDir);

  await rewriteGameDependencies(gameDir, tarballs);
  await run("npm", ["install"], { cwd: gameDir });
  await run("npm", ["run", "build"], { cwd: gameDir });
  const gameConfig = JSON.parse(await readFile(join(gameDir, "threenative.config.json"), "utf8"));
  const bundleRelativePath = gameConfig.outDir;
  if (typeof bundleRelativePath !== "string" || bundleRelativePath.length === 0) {
    throw new Error("Created project did not declare threenative.config.json outDir.");
  }
  const installedBevyManifest = join(gameDir, "node_modules", "@threenative", "cli", "dist", "runtime-bevy", "Cargo.toml");
  await access(installedBevyManifest);
  await run("cargo", [
    "build",
    "--manifest-path",
    installedBevyManifest,
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_runtime",
    "--quiet",
  ], { cwd: gameDir });
  await run("npx", ["playwright", "install", "chromium"], { cwd: gameDir });
  await run("npm", ["run", "verify", "--", "--json"], { cwd: gameDir });
  await run("npx", [
    "tn",
    "package",
    "--bundle",
    bundleRelativePath,
    "--target",
    "desktop",
    "--out",
    "dist/local-distributable",
    "--json",
  ], { cwd: gameDir });
  await run("npx", [
    "tn",
    "validate",
    "--bundle",
    `dist/local-distributable/desktop/${basename(bundleRelativePath)}`,
    "--json",
  ], { cwd: gameDir });
  await run("tar", [
    "-czf",
    `dist/local-distributable/${distributableArchiveName}`,
    "-C",
    "dist/local-distributable",
    "desktop",
  ], { cwd: gameDir });

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
    aiDocsPath: join(consumerDir, "node_modules", "@threenative", "cli", "dist", "ai"),
    bundlePath: join(gameDir, bundleRelativePath),
    capabilitiesPath: join(consumerDir, "node_modules", "@threenative", "ir", "capabilities", "threenative.capabilities.json"),
    consumerDir,
    diagnosticsCatalogPath: join(consumerDir, "node_modules", "@threenative", "ir", "diagnostics", "diagnostics.catalog.json"),
    distributableArchive: join(gameDir, "dist", "local-distributable", distributableArchiveName),
    distributablePath: join(gameDir, "dist", "local-distributable", "desktop"),
    nativeRuntimeVerified: true,
    previewVerified: true,
    reportPath,
    status: report.status,
    tarballs: Object.fromEntries([...tarballs].map(([name, path]) => [name, basename(path)])),
  };

  return { result, workRoot };
}

async function listTgz(dir) {
  try {
    return (await readdir(dir)).filter((file) => file.endsWith(".tgz")).sort();
  } catch {
    return [];
  }
}

async function verifyGeneratedProjectAgentInstructions(projectDir) {
  const agents = await readFile(join(projectDir, "AGENTS.md"), "utf8");
  const claude = await readFile(join(projectDir, "CLAUDE.md"), "utf8");
  for (const phrase of ["tn scene ... --json", "content/**/*.json", "Do not edit them as the fix"]) {
    if (!agents.includes(phrase)) {
      throw new Error(`Generated AGENTS.md is missing required phrase '${phrase}'.`);
    }
  }
  if (!claude.includes("Use `AGENTS.md`")) {
    throw new Error("Generated CLAUDE.md does not point agents to AGENTS.md.");
  }
}

async function rewriteGameDependencies(projectDir, packageTarballs) {
  const packageJsonPath = join(projectDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.dependencies = {
    ...packageJson.dependencies,
    "@threenative/sdk": `file:${packageTarballs.get("@threenative/sdk")}`,
    "@threenative/ir": `file:${packageTarballs.get("@threenative/ir")}`,
    "@threenative/authoring": `file:${packageTarballs.get("@threenative/authoring")}`,
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

export async function validateInstalledDistributionArtifacts(projectDir) {
  const diagnostics = [];
  for (const [name] of packageOrder) {
    const packageRoot = join(projectDir, "node_modules", ...name.split("/"));
    for (const file of ["package.json", "dist/index.d.ts", "dist/index.d.ts.map", "dist/index.js"]) {
      await requireInstalledFile(diagnostics, packageRoot, file, "TN_DISTRIBUTION_PACKED_ARTIFACT_MISSING", `${name} packed package must include ${file}.`);
    }
  }

  const irRoot = join(projectDir, "node_modules", "@threenative", "ir");
  for (const file of requiredIrMetadataFiles) {
    await requireInstalledFile(diagnostics, irRoot, file, "TN_DISTRIBUTION_PACKED_METADATA_MISSING", `@threenative/ir packed package must include ${file}.`);
  }

  const aiRoot = join(projectDir, "node_modules", "@threenative", "cli", "dist", "ai");
  for (const file of requiredAiDocFiles) {
    await requireInstalledFile(diagnostics, aiRoot, file, "TN_DISTRIBUTION_AI_DOC_MISSING", `@threenative/cli packed AI docs must include ${file}.`);
  }

  return diagnostics;
}

export async function verifyInstalledDistributionArtifacts(projectDir) {
  const diagnostics = await validateInstalledDistributionArtifacts(projectDir);
  if (diagnostics.length > 0) {
    throw new Error(
      `Installed distribution artifact check failed.\n${diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.path}: ${diagnostic.message}`)
        .join("\n")}`,
    );
  }

  const aiRoot = join(projectDir, "node_modules", "@threenative", "cli", "dist", "ai");
  const combined = [];
  for (const file of requiredAiDocFiles) {
    combined.push(await readFile(join(aiRoot, file), "utf8"));
  }
  const text = combined.join("\n");
  for (const phrase of ["@threenative/sdk", "@threenative/ir/capabilities/threenative.capabilities.json", "@threenative/ir/diagnostics/diagnostics.catalog.json", "raw Bevy", "generated bundle"]) {
    if (!text.includes(phrase)) {
      throw new Error(`Installed AI docs are missing required phrase '${phrase}'.`);
    }
  }
}

async function requireInstalledFile(diagnostics, root, file, code, message) {
  const path = join(root, file);
  try {
    await access(path);
  } catch {
    diagnostics.push({
      code,
      message,
      path,
      severity: "error",
      suggestedFix: "Rebuild the package and update package.json files/build copy steps so the artifact is included in the packed tarball.",
    });
  }
}

export async function writeConsumerTypecheckFixture(projectDir) {
  await writeFile(
    join(projectDir, "threenative-contract.mts"),
    `import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, defineGame, defineScene } from "@threenative/sdk";
import { schemaUrls, validateBundle, validateBundleRelativePath } from "@threenative/ir";
import capabilities from "@threenative/ir/capabilities/threenative.capabilities.json" with { type: "json" };
import diagnosticsCatalog from "@threenative/ir/diagnostics/diagnostics.catalog.json" with { type: "json" };
import { validateBundleRelativePath as validateBundleRelativePathSubpath } from "@threenative/ir/bundlePaths";
import { diagnoseUnsupportedRuntimeDeclarations } from "@threenative/ir/runtimeDiagnostics";
import { buildProject } from "@threenative/compiler";

const scene = new Scene({ id: "arena" });
scene.add(new Mesh({
  geometry: new BoxGeometry({ size: [1, 1, 1] }),
  id: "cube",
  material: new MeshStandardMaterial({ color: "#44aa88" }),
}));

const game = defineGame({
  initialScene: "arena",
  scenes: [defineScene({ id: "arena", kind: "level", visual: scene })],
});

const pathCheck = validateBundleRelativePath("world.ir.json");
const subpathCheck = validateBundleRelativePathSubpath("assets/hero.glb");
const manifestSchema = schemaUrls.manifest;

void game;
void pathCheck;
void subpathCheck;
void manifestSchema;
void validateBundle;
void diagnoseUnsupportedRuntimeDeclarations;
void buildProject;
void capabilities;
void diagnosticsCatalog;
`,
    "utf8",
  );
  await writeFile(
    join(projectDir, "tsconfig.threenative-contract.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          resolveJsonModule: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2023",
        },
        include: ["threenative-contract.mts"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
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

async function main() {
  const workRoot = await mkdtemp(join(tmpdir(), "threenative-distribution-"));
  try {
    const run = await runDistributionVerification({ workRoot });
    console.log(JSON.stringify(run.result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Work directory preserved for inspection: ${workRoot}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
