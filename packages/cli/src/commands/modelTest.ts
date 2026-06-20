import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { inspectAsset } from "./asset.js";

interface ModelTestFile {
  path: string;
  role: string;
}

export async function modelTestCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const verify = normalizedArgv.includes("--verify");
  const assetArg = normalizedArgv.find((arg) => !arg.startsWith("-"));
  const outArg = flagValue(normalizedArgv, "--out") ?? flagValue(normalizedArgv, "--project") ?? "artifacts/model-test";

  if (assetArg === undefined) {
    return diagnosticResult(
      { code: "TN_MODEL_TEST_USAGE", message: "Usage: tn model-test <asset-path> [--out <dir>] [--verify] [--json]" },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const assetPath = resolvePath(cwd, assetArg);
  const outDir = resolvePath(cwd, outArg);

  try {
    const report = await createModelTestProject({ assetPath, outDir, verify });
    return {
      exitCode: report.verified?.ok === false ? 1 : 0,
      stdout: json
        ? `${JSON.stringify({ code: report.verified?.ok === false ? "TN_MODEL_TEST_VERIFY_FAILED" : "TN_MODEL_TEST_OK", ...report }, null, 2)}\n`
        : renderModelTestReport(report),
    };
  } catch (error) {
    return diagnosticResult(
      { code: "TN_MODEL_TEST_FAILED", message: error instanceof Error ? error.message : String(error) },
      { exitCode: 1, json, stderr: !json },
    );
  }
}

export async function createModelTestProject(options: { assetPath: string; outDir: string; verify?: boolean }): Promise<{
  asset: string;
  bounds?: unknown;
  calibration?: unknown;
  files: ModelTestFile[];
  outDir: string;
  verified?: { bundlePath?: string; diagnostics?: unknown[]; ok: boolean };
}> {
  const inspection = await inspectAsset(options.assetPath);
  if (inspection.code !== "TN_ASSET_INSPECT_OK") {
    const firstError = inspection.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    throw new Error(firstError?.message ?? "Asset inspection failed.");
  }

  await mkdir(options.outDir, { recursive: true });
  const assetFileName = basename(options.assetPath);
  const assetOutPath = join(options.outDir, "assets", assetFileName);
  await mkdir(dirname(assetOutPath), { recursive: true });
  await copyFile(options.assetPath, assetOutPath);

  const files: ModelTestFile[] = [{ path: assetOutPath, role: "asset" }];
  for (const dependency of inspection.dependencies ?? []) {
    if (dependency.path === undefined || dependency.uri === undefined || dependency.embedded === true || dependency.missing === true) {
      continue;
    }
    const dependencyOutPath = join(options.outDir, "assets", decodeURIComponent(dependency.uri));
    await mkdir(dirname(dependencyOutPath), { recursive: true });
    await copyFile(dependency.path, dependencyOutPath);
    files.push({ path: dependencyOutPath, role: `${dependency.kind}-dependency` });
  }

  const sourcePath = join(options.outDir, "src", "game.ts");
  const configPath = join(options.outDir, "threenative.config.json");
  const packagePath = join(options.outDir, "package.json");
  const readmePath = join(options.outDir, "README.md");
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, renderGameSource({ assetFileName, inspection }));
  await writeFile(
    configPath,
    `${JSON.stringify({ schema: "threenative.project", version: "0.1.0", entry: "src/game.ts", outDir: "dist/model-test.bundle" }, null, 2)}\n`,
  );
  await writeFile(packagePath, `${JSON.stringify({
    name: "threenative-model-test",
    private: true,
    type: "module",
    scripts: {
      build: "tn build --project .",
      validate: "tn validate --project .",
      verify: "tn verify --project . --frames 2 --json",
    },
    dependencies: {
      "@threenative/sdk": "file:/home/joao/projects/threejs-to-bevy/packages/sdk",
    },
    devDependencies: {
      "@threenative/cli": "file:/home/joao/projects/threejs-to-bevy/packages/cli",
    },
  }, null, 2)}\n`);
  await writeFile(readmePath, renderReadme(options.assetPath, inspection));
  files.push({ path: sourcePath, role: "source" }, { path: configPath, role: "config" }, { path: packagePath, role: "package" }, { path: readmePath, role: "docs" });

  let verified: { bundlePath?: string; diagnostics?: unknown[]; ok: boolean } | undefined;
  if (options.verify === true) {
    const config = await loadProjectConfig(options.outDir);
    const build = await buildProject(options.outDir);
    const bundlePath = resolve(options.outDir, config.outDir);
    const validation = await validateBundle(build.bundlePath);
    verified = { bundlePath, diagnostics: validation.diagnostics, ok: validation.ok };
  }

  return {
    asset: options.assetPath,
    bounds: inspection.bounds,
    calibration: inspection.calibration,
    files,
    outDir: options.outDir,
    verified,
  };
}

function renderGameSource(options: { assetFileName: string; inspection: Awaited<ReturnType<typeof inspectAsset>> }): string {
  const bounds = options.inspection.bounds;
  const calibration = options.inspection.calibration;
  const size = bounds?.size ?? [1, 1, 1];
  const center = bounds?.center ?? [0, 0, 0];
  const largest = Math.max(0.001, ...size.map((value) => Math.abs(value)));
  const floorSize = round(Math.max(4, largest * 2));
  const targetScale = calibration?.fitScales?.targetHeight2m ?? calibration?.fitScales?.targetLength4m ?? 1;
  const scale = round(targetScale);
  const cameraDistance = round(Math.max(calibration?.camera.recommendedDistance ?? largest * 2.5, 3));
  const cameraHeight = round(Math.max(size[1] * scale * 0.6, 1.4));
  const minY = bounds === undefined ? 0 : bounds.min[1];
  const yOffset = round(-minY);

  return `import { AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, modelAsset } from "@threenative/sdk";\n\nconst model = modelAsset("model.under-test", "assets/${options.assetFileName}");\nconst scene = new Scene({ assetRefs: [model], id: "model-test" });\n\nconst floor = new Mesh({\n  geometry: new BoxGeometry({ size: [${floorSize}, 0.04, ${floorSize}] }),\n  id: "scale.floor.1m-grid",\n  material: new MeshStandardMaterial({ color: "#263445", roughness: 0.9 }),\n});\nfloor.position.set(0, -0.02, 0);\nscene.add(floor);\n\nconst modelUnderTest = new Mesh({\n  assetRefs: [model],\n  geometry: new BoxGeometry({ size: [0.1, 0.1, 0.1] }),\n  id: "model.under-test.instance",\n  material: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }),\n});\nmodelUnderTest.position.set(${round(-center[0] * scale)}, ${round(yOffset * scale)}, ${round(-center[2] * scale)});\nmodelUnderTest.scale.set(${scale}, ${scale}, ${scale});\nscene.add(modelUnderTest);\n\nconst boundsMarker = new Mesh({\n  geometry: new BoxGeometry({ size: [${round(Math.max(size[0] * scale, 0.05))}, ${round(Math.max(size[1] * scale, 0.05))}, ${round(Math.max(size[2] * scale, 0.05))}] }),\n  id: "model.bounds.reference",\n  material: new MeshStandardMaterial({ color: "#38bdf8", opacity: 0.18, transparent: true }),\n});\nboundsMarker.position.set(0, ${round((size[1] * scale) / 2)}, 0);\nscene.add(boundsMarker);\n\nconst oneMeterRuler = new Mesh({\n  geometry: new BoxGeometry({ size: [1, 0.05, 0.05] }),\n  id: "scale.ruler.1m",\n  material: new MeshStandardMaterial({ color: "#f97316" }),\n});\noneMeterRuler.position.set(0, 0.05, ${round(floorSize / 2 - 0.4)});\nscene.add(oneMeterRuler);\n\nconst camera = new PerspectiveCamera({ far: ${round(Math.max(cameraDistance * 6, 50))}, fovY: 50, id: "camera.model-test", near: 0.01 });\ncamera.position.set(0, ${cameraHeight}, ${cameraDistance});\nscene.add(camera);\nscene.setActiveCamera(camera);\n\nscene.add(new AmbientLight({ color: "#dbeafe", id: "light.ambient", intensity: 0.75 }));\nconst key = new DirectionalLight({ color: "#fff7ed", id: "light.key", intensity: 2.2 });\nkey.position.set(3, 5, 4);\nscene.add(key);\n\nexport default { scene };\n`;
}

function renderReadme(assetPath: string, inspection: Awaited<ReturnType<typeof inspectAsset>>): string {
  return `# ThreeNative model test\n\nGenerated by \`tn model-test\` for:\n\n\`${assetPath}\`\n\n## What this scene contains\n\n- The inspected model copied into \`assets/\`.\n- A 1 meter orange ruler and floor plane for scale checks.\n- A translucent bounds marker sized from glTF accessor min/max bounds.\n- Camera/light defaults from asset calibration hints.\n\n## Inspection summary\n\n- Bounds: ${inspection.bounds === undefined ? "unavailable" : JSON.stringify(inspection.bounds.size)}\n- Calibration: ${inspection.calibration === undefined ? "unavailable" : JSON.stringify(inspection.calibration.fitScales)}\n\nRun \`pnpm run build\`, \`pnpm run validate\`, then \`pnpm run verify\` after installing workspace dependencies.\n`;
}

function renderModelTestReport(report: Awaited<ReturnType<typeof createModelTestProject>>): string {
  const verified = report.verified === undefined ? "Verification: not requested" : `Verification: ${report.verified.ok ? "passed" : "failed"}${report.verified.bundlePath === undefined ? "" : ` (${report.verified.bundlePath})`}`;
  return `Model test project generated.\nOutput: ${report.outDir}\nAsset: ${report.asset}\nFiles:\n${report.files.map((file) => `  - ${file.role}: ${file.path}`).join("\n")}\n${verified}\n`;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
