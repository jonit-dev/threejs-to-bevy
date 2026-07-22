import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { assetCommand, authoringCommand, buildCommand, modelTestCommand } from "@threenative/cli";
import { PNG } from "pngjs";

import { materializeCookbookFixtureManifest, validateCookbookFixtureReviewMetadata } from "./cookbookGate.js";

const execFileAsync = promisify(execFile);
const GATE_NAME = "verify:img2threejs";
const FIXTURE_MANIFEST = "tools/verify/evidence/img2threejs/deterministic-fixture.json";
const GENERATOR_ID = "prop.radio";
const OUTPUT = "assets/generated/prop.radio.glb";
const RECIPE = "content/generators/prop.radio.img2threejs.json";
const EXPECTED_CONTROLS = [
  ["network", "TN_IMG2THREEJS_NETWORK_BLOCKED"],
  ["unsupported-material", "TN_IMG2THREEJS_FEATURE_UNSUPPORTED"],
  ["incomplete-review", "TN_IMG2THREEJS_REVIEW_INCOMPLETE"],
  ["unreviewed-upstream", "TN_IMG2THREEJS_UPSTREAM_UNREVIEWED"],
  ["path-traversal", "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT"],
  ["output-budget", "TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED"],
  ["visual-parity", "TN_IMG2THREEJS_VISUAL_PARITY_FAILED"],
  ["manual-conflict", "TN_GENERATOR_OUTPUT_CONFLICT"],
] as const;

interface CommandResult {
  exitCode: number;
  stderr?: string;
  stdout: string;
}

interface NegativeControlEvidence {
  code: string;
  id: string;
  outputPromoted: boolean;
  passed: boolean;
}

interface PositiveRun {
  glbHash: string;
  inputHash: string;
  inspection: Record<string, unknown>;
  outputHash: string;
  projectPath: string;
  proofFiles: string[];
  validation: Record<string, unknown>;
  visualMetrics: Record<string, unknown>;
}

interface GateDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error";
  suggestedFix: string;
}

export interface Img2ThreejsGateResult {
  diagnostics: GateDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export async function runImg2ThreejsGate(options: { root?: string } = {}): Promise<Img2ThreejsGateResult> {
  const root = options.root ?? resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const artifactDir = resolve(root, "tools/verify/artifacts/img2threejs");
  const reportPath = resolve(artifactDir, "verification-report.json");
  const timingsPath = resolve(artifactDir, "timings.json");
  const temporary = await mkdtemp(resolve(tmpdir(), "tn-img2threejs-gate-"));
  const timings: Record<string, number> = {};
  await rm(artifactDir, { force: true, recursive: true });
  await mkdir(artifactDir, { recursive: true });
  try {
    await validateCookbookFixtureReviewMetadata(root, FIXTURE_MANIFEST);
    const fixture = JSON.parse(await readFile(resolve(root, FIXTURE_MANIFEST), "utf8")) as Record<string, unknown>;
    const first = await timed(timings, "cleanExportA", () => runPositive(root, resolve(temporary, "positive-a")));
    const second = await timed(timings, "cleanExportB", () => runPositive(root, resolve(temporary, "positive-b")));
    assertEqual(first.glbHash, second.glbHash, "two clean exports produced different GLB hashes");
    assertEqual(first.outputHash, second.outputHash, "two clean exports produced different ownership hashes");
    assertEqual(stableJson(semanticInspection(first.inspection)), stableJson(semanticInspection(second.inspection)), "two clean exports produced different semantic inspection");
    assertEqual(stableJson(first.visualMetrics), stableJson(second.visualMetrics), "two clean exports produced different reload metrics");

    const runtime = await timed(timings, "runtimeProof", () => captureRuntimeProof(root, first, artifactDir));
    const controls = await timed(timings, "negativeControls", () => runNegativeControls(root, temporary));
    for (const [id, expectedCode] of EXPECTED_CONTROLS) {
      const control = controls.find((entry) => entry.id === id);
      if (control?.passed !== true || control.code !== expectedCode || control.outputPromoted) throw new Error(`negative control '${id}' did not prove ${expectedCode} without promotion: ${stableJson(control)}`);
    }

    const glb = await readFile(resolve(first.projectPath, OUTPUT));
    const gltf = parseGlbJson(glb);
    const rootText = root.replaceAll("\\", "/");
    const report = {
      schema: "threenative.img2threejs-verification",
      version: "0.1.0",
      ok: true,
      status: "passed",
      fixture: {
        id: fixture.fixtureId,
        manifest: FIXTURE_MANIFEST,
        manifestHash: sha256(await readFile(resolve(root, FIXTURE_MANIFEST))),
        rights: fixture.rights,
        reviewedSource: fixture.reviewedSource,
        manualCompositionReview: fixture.manualCompositionReview,
      },
      deterministicExport: {
        cleanRuns: 2,
        factoryHash: sha256(await readFile(resolve(first.projectPath, "src/generators/createPropRadioModel.ts"))),
        glbHash: first.glbHash,
        inputHash: first.inputHash,
        outputHash: first.outputHash,
        sourceImageHash: sha256(await readFile(resolve(first.projectPath, "content/references/prop.radio.png"))),
      },
      gltf: {
        bounds: first.inspection.bounds,
        byteSize: glb.byteLength,
        counts: first.inspection.counts,
        extensionsRequired: sortedStrings(gltf.extensionsRequired),
        extensionsUsed: sortedStrings(gltf.extensionsUsed),
        namedNodes: first.inspection.namedNodes,
        validation: validationSummary(first.validation),
      },
      visual: {
        reloadMetrics: first.visualMetrics,
        fourAngleCaptures: runtime.web.captures,
        contactSheet: "contact-sheets/four-angle-web.svg",
        independentReferenceContactSheet: "contact-sheets/independent-reference.svg",
        independentReferenceHash: sha256(await readFile(resolve(first.projectPath, "content/references/prop.radio-independent-reference.png"))),
        independentReferenceDisposition: "manual-review-only; first-party synthetic concept reference, not copied from a runtime render",
      },
      runtime: {
        web: runtime.web.observation,
        desktop: runtime.desktop,
      },
      negativeControls: controls,
      versions: await versionEvidence(root),
      durations: "timings.json",
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    await assertRetainedSurfaceRedaction(first, serialized, glb, fixture, [rootText, temporary.replaceAll("\\", "/")]);
    await Promise.all([
      writeFile(reportPath, serialized, "utf8"),
      writeFile(timingsPath, `${JSON.stringify({ schema: "threenative.gate-timings", version: "0.1.0", durationsMs: timings }, null, 2)}\n`, "utf8"),
      cp(resolve(first.projectPath, OUTPUT), resolve(artifactDir, "prop.radio.glb")),
      copyReloadProof(first, artifactDir),
    ]);
    return { diagnostics: [], ok: true, reportPath };
  } catch (error) {
    const diagnostic = gateDiagnostic(error, [root, temporary]);
    await writeFile(reportPath, `${JSON.stringify({ schema: "threenative.img2threejs-verification", version: "0.1.0", ok: false, diagnostics: [diagnostic] }, null, 2)}\n`, "utf8");
    await writeFile(timingsPath, `${JSON.stringify({ schema: "threenative.gate-timings", version: "0.1.0", durationsMs: timings }, null, 2)}\n`, "utf8");
    return { diagnostics: [diagnostic], ok: false, reportPath };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

async function runPositive(root: string, projectPath: string): Promise<PositiveRun> {
  await prepareProject(root, projectPath);
  const result = await generate(projectPath);
  requireSuccess(result, "positive img2threejs finalization");
  const payload = parsePayload(result);
  assertEqual(payload.code, "TN_ASSET_GENERATE_OK", "positive finalization returned the wrong code");
  const validate = await authoringCommand(["validate", "--project", projectPath, "--json"], { cwd: root });
  requireSuccess(validate, "authoring validation");
  const build = await buildCommand(["--project", projectPath, "--json"], root);
  requireSuccess(build, "web bundle build");
  const output = await readFile(resolve(projectPath, OUTPUT));
  if (!isRecord(payload.inspection) || !isRecord(payload.validation) || !isRecord(payload.visualMetrics)) throw new Error("positive finalization omitted inspection, validator, or visual evidence");
  const issues = isRecord(payload.validation.issues) ? payload.validation.issues : {};
  if (issues.numErrors !== 0) throw new Error("Khronos validator reported errors");
  const proofFiles = Array.isArray(payload.proofFiles) ? payload.proofFiles.filter((entry): entry is string => typeof entry === "string") : [];
  if (proofFiles.length !== 4) throw new Error("positive finalization did not retain source/reload/diff/metric proof");
  return {
    glbHash: sha256(output),
    inputHash: requireString(payload.inputHash, "inputHash"),
    inspection: payload.inspection,
    outputHash: requireString(payload.outputHash, "outputHash"),
    projectPath,
    proofFiles,
    validation: payload.validation,
    visualMetrics: payload.visualMetrics,
  };
}

async function captureRuntimeProof(root: string, run: PositiveRun, artifactDir: string): Promise<{
  desktop: Record<string, unknown>;
  web: { captures: Array<Record<string, unknown>>; observation: Record<string, unknown> };
}> {
  const modelTestDir = resolve(run.projectPath, "artifacts/model-test");
  const modelTest = await modelTestCommand([resolve(run.projectPath, OUTPUT), "--angles", "0,90,180,270", "--out", modelTestDir, "--json"], run.projectPath);
  requireSuccess(modelTest, "four-angle web model test");
  const payload = parsePayload(modelTest);
  if (!isRecord(payload.turntable) || !Array.isArray(payload.turntable.captures) || payload.turntable.captures.length !== 4) throw new Error("model-test did not produce four web captures");
  if (!isRecord(payload.materials) || payload.materials.ok !== true) throw new Error("web runtime did not observe the authored GLB materials");
  const screenshotDir = resolve(artifactDir, "screenshots/web");
  await mkdir(screenshotDir, { recursive: true });
  const captures: Array<Record<string, unknown>> = [];
  for (const value of payload.turntable.captures) {
    if (!isRecord(value) || typeof value.outPath !== "string" || typeof value.angleDegrees !== "number") throw new Error("model-test returned malformed capture evidence");
    const name = `yaw-${String(value.angleDegrees).padStart(3, "0")}.png`;
    const destination = resolve(screenshotDir, name);
    await cp(value.outPath, destination);
    const analysis = await analyzePng(destination);
    if (!analysis.nonblank) throw new Error(`web capture ${value.angleDegrees} is blank`);
    const checks = isRecord(value.checks) ? value.checks : {};
    captures.push({ angleDegrees: value.angleDegrees, byteSize: analysis.byteSize, nonBackgroundFraction: analysis.nonBackgroundFraction, path: `screenshots/web/${name}`, visibleMeshCount: checks.visibleMeshCount });
  }
  await enableNativeTraceHost(modelTestDir, root);
  const bundlePath = resolve(modelTestDir, "dist/model-test.bundle");
  const nativeDir = resolve(artifactDir, "screenshots/desktop");
  const nativePath = resolve(nativeDir, "model-test.png");
  const tracePath = resolve(nativeDir, "model-test.transform-trace.json");
  await mkdir(nativeDir, { recursive: true });
  await runNativeCapture(root, bundlePath, nativePath, tracePath);
  const nativeAnalysis = await analyzePng(nativePath);
  const trace = JSON.parse(await readFile(tracePath, "utf8")) as unknown;
  if (!isRecord(trace) || !isRecord(trace.captureRequest) || trace.captureRequest.assetsReady !== true) throw new Error("desktop capture did not prove model dependencies ready at capture");
  if (!nativeAnalysis.nonblank) throw new Error("desktop GLB capture is blank");
  await writeContactSheets(run.projectPath, artifactDir, captures);
  return {
    desktop: {
      assetsReadyAtCapture: true,
      byteSize: nativeAnalysis.byteSize,
      entity: "model.under-test.instance",
      nonBackgroundFraction: nativeAnalysis.nonBackgroundFraction,
      path: "screenshots/desktop/model-test.png",
      trace: "screenshots/desktop/model-test.transform-trace.json",
      visualPromotion: false,
    },
    web: {
      captures,
      observation: {
        angles: captures.map((capture) => capture.angleDegrees),
        materialVerdict: payload.materials.verdict,
        modelAssetRendered: true,
        visibleMeshCounts: captures.map((capture) => capture.visibleMeshCount),
      },
    },
  };
}

async function enableNativeTraceHost(modelTestDir: string, root: string): Promise<void> {
  const scenePath = resolve(modelTestDir, "content/scenes/model-test.scene.json");
  const scene = JSON.parse(await readFile(scenePath, "utf8")) as Record<string, unknown>;
  scene.systems = [{
    id: "img2threejs-proof-tick",
    schedule: "update",
    script: { export: "img2ThreejsProofTick", module: "src/scripts/img2threejsProof.ts" },
    source: "behavior-metadata",
  }];
  await writeJson(scenePath, scene);
  const scriptPath = resolve(modelTestDir, "src/scripts/img2threejsProof.ts");
  await mkdir(dirname(scriptPath), { recursive: true });
  await writeFile(scriptPath, "export function img2ThreejsProofTick(): void { return; }\n", "utf8");
  const build = await buildCommand(["--project", modelTestDir, "--json"], root);
  requireSuccess(build, "desktop model-test bundle build");
}

async function runNegativeControls(root: string, temporary: string): Promise<NegativeControlEvidence[]> {
  const controls: NegativeControlEvidence[] = [];
  let networkConnections = 0;
  const listener = createServer((_request, response) => { networkConnections += 1; response.end("unexpected"); });
  await new Promise<void>((done) => listener.listen(0, "127.0.0.1", done));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("network control could not bind its local listener");
  try {
    controls.push(await negative(root, temporary, "network", "TN_IMG2THREEJS_NETWORK_BLOCKED", async (project) => {
      await writeFile(resolve(project, "src/generators/createPropRadioModel.ts"), `import * as THREE from "three"; export function createPropRadioModel() { fetch("http://127.0.0.1:${address.port}/blocked"); const root = new THREE.Group(); root.name = "prop.radio"; return root; }\n`);
    }));
  } finally {
    await new Promise<void>((done, reject) => listener.close((error) => error === undefined ? done() : reject(error)));
  }
  if (networkConnections !== 0) throw new Error(`network negative control reached the listener ${networkConnections} time(s)`);

  controls.push(await negative(root, temporary, "unsupported-material", "TN_IMG2THREEJS_FEATURE_UNSUPPORTED", async (project) => {
    await writeFile(resolve(project, "src/generators/createPropRadioModel.ts"), "import * as THREE from \"three\"; export function createPropRadioModel() { const root = new THREE.Group(); root.name = \"prop.radio\"; const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial()); mesh.name = \"body\"; root.add(mesh); return root; }\n");
  }));
  controls.push(await negative(root, temporary, "incomplete-review", "TN_IMG2THREEJS_REVIEW_INCOMPLETE", async (project) => {
    const path = resolve(project, "content/generators/prop.radio.sculpt-spec.json");
    const spec = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    spec.reviewHistory = (spec.reviewHistory as unknown[]).slice(0, -1);
    await writeJson(path, spec);
    await refreshValidationHash(project);
  }));
  controls.push(await negative(root, temporary, "unreviewed-upstream", "TN_IMG2THREEJS_UPSTREAM_UNREVIEWED", async (project) => {
    const path = resolve(project, RECIPE);
    const recipe = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    (recipe.upstream as Record<string, unknown>).commit = "0000000000000000000000000000000000000000";
    await writeJson(path, recipe);
  }));
  controls.push(await negative(root, temporary, "path-traversal", "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT", async (project) => {
    const path = resolve(project, RECIPE);
    const recipe = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    recipe.sourceImage = "../escape.png";
    await writeJson(path, recipe);
  }));
  controls.push(await negative(root, temporary, "output-budget", "TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED", async (project) => {
    const path = resolve(project, RECIPE);
    const recipe = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    (recipe.budgets as Record<string, unknown>).maxOutputBytes = 1;
    await writeJson(path, recipe);
  }));
  controls.push(await negative(root, temporary, "visual-parity", "TN_IMG2THREEJS_VISUAL_PARITY_FAILED", async () => undefined, true));
  controls.push(await negative(root, temporary, "manual-conflict", "TN_GENERATOR_OUTPUT_CONFLICT", async (project) => {
    await mkdir(dirname(resolve(project, OUTPUT)), { recursive: true });
    await writeFile(resolve(project, OUTPUT), "manual-output-must-survive", "utf8");
  }, false, "manual-output-must-survive"));
  return controls;
}

async function negative(
  root: string,
  temporary: string,
  id: string,
  expectedCode: string,
  mutate: (project: string) => Promise<void>,
  corruptParity = false,
  expectedExistingOutput?: string,
): Promise<NegativeControlEvidence> {
  const project = resolve(temporary, `negative-${id}`);
  await prepareProject(root, project);
  await mutate(project);
  let dependencies: Record<string, unknown> | undefined;
  if (corruptParity) {
    const module = await import(pathToFileURL(resolve(root, "packages/cli/dist/img2threejs/visualParity.js")).href) as {
      measureImg2ThreejsVisualParity(source: PixelFrame, reloaded: PixelFrame): { diff: Uint8Array; metrics: Record<string, unknown> };
    };
    dependencies = {
      measureVisualParity: (source: PixelFrame, reloaded: PixelFrame) => {
        const corrupted = { ...reloaded, data: Uint8Array.from(reloaded.data) };
        for (let index = 0; index < corrupted.data.length; index += 4) {
          corrupted.data[index] = 255 - corrupted.data[index]!;
          corrupted.data[index + 1] = 255 - corrupted.data[index + 1]!;
          corrupted.data[index + 2] = 255 - corrupted.data[index + 2]!;
        }
        return module.measureImg2ThreejsVisualParity(source, corrupted);
      },
    };
  }
  const result = await generate(project, dependencies);
  const payload = parsePayload(result);
  const code = diagnosticCode(payload);
  let outputPromoted = false;
  try {
    const bytes = await readFile(resolve(project, OUTPUT));
    outputPromoted = expectedExistingOutput === undefined || bytes.toString("utf8") !== expectedExistingOutput;
  } catch (error) {
    if (!isMissingCommand(error)) throw error;
    outputPromoted = expectedExistingOutput !== undefined;
  }
  return { code, id, outputPromoted, passed: result.exitCode !== 0 && code === expectedCode && !outputPromoted };
}

interface PixelFrame { data: Uint8Array; height: number; width: number }

async function generate(projectPath: string, img2ThreejsDependencies?: Record<string, unknown>): Promise<CommandResult> {
  return assetCommand(["generate", GENERATOR_ID, "--provider", "img2threejs", "--recipe", RECIPE, "--project", projectPath, "--json"], {
    cwd: projectPath,
    ...(img2ThreejsDependencies === undefined ? {} : { img2ThreejsDependencies: img2ThreejsDependencies as never }),
  });
}

async function prepareProject(root: string, projectPath: string): Promise<void> {
  await cp(resolve(root, "templates/structured-source-starter"), projectPath, {
    recursive: true,
    filter: (source) => !source.includes("/node_modules/") && !source.includes("/dist/") && !source.includes("/artifacts/"),
  });
  await materializeCookbookFixtureManifest(root, projectPath, FIXTURE_MANIFEST);
}

async function refreshValidationHash(project: string): Promise<void> {
  const spec = await readFile(resolve(project, "content/generators/prop.radio.sculpt-spec.json"));
  const path = resolve(project, "content/generators/prop.radio.validation.json");
  const validation = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  validation.sculptSpecHash = sha256(spec);
  await writeJson(path, validation);
}

async function runNativeCapture(root: string, bundlePath: string, screenshotPath: string, tracePath: string): Promise<void> {
  const args = ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, "camera.model-test", screenshotPath, "300", "--transform-trace", "model.under-test.instance", tracePath];
  try {
    await execFileAsync("xvfb-run", ["-a", "cargo", ...args], { cwd: resolve(root, "runtime-bevy"), timeout: 240_000 });
  } catch (error) {
    if (isMissingCommand(error)) await execFileAsync("cargo", args, { cwd: resolve(root, "runtime-bevy"), timeout: 240_000 });
    else throw error;
  }
}

async function writeContactSheets(projectPath: string, artifactDir: string, captures: Array<Record<string, unknown>>): Promise<void> {
  const directory = resolve(artifactDir, "contact-sheets");
  await mkdir(directory, { recursive: true });
  const cells = captures.map((capture, index) => `<text x="${20 + index * 320}" y="28" fill="#fff">yaw ${capture.angleDegrees} degrees</text><image x="${20 + index * 320}" y="42" width="300" height="169" href="../${capture.path}"/>`).join("");
  await writeFile(resolve(directory, "four-angle-web.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="235"><rect width="100%" height="100%" fill="#111318"/>${cells}</svg>\n`, "utf8");
  const independent = resolve(projectPath, "content/references/prop.radio-independent-reference.png");
  const independentAnalysis = await analyzePng(independent);
  if (!independentAnalysis.nonblank) throw new Error("independent reference is blank or invalid");
  await cp(independent, resolve(artifactDir, "independent-reference.png"));
  await writeFile(resolve(directory, "independent-reference.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="420"><rect width="100%" height="100%" fill="#111318"/><text x="20" y="28" fill="#fff">first-party independent concept reference</text><image x="20" y="42" width="440" height="283" href="../independent-reference.png"/><text x="520" y="28" fill="#fff">accepted factory, web runtime yaw 0</text><image x="520" y="42" width="440" height="248" href="../screenshots/web/yaw-000.png"/><text x="20" y="350" fill="#ddd">Decision: accepted for bounded stylized-radio identity; not pixel or native parity.</text><text x="20" y="375" fill="#ddd">Known difference: concept orange antenna/button treatment is omitted by the factory.</text><text x="20" y="400" fill="#ddd">Cyan bounds, orange ruler, floor wedge, and grid are preview helpers, not model geometry.</text></svg>\n`, "utf8");
}

async function copyReloadProof(run: PositiveRun, artifactDir: string): Promise<void> {
  const destination = resolve(artifactDir, "reload-proof");
  await mkdir(destination, { recursive: true });
  for (const path of run.proofFiles) await cp(resolve(run.projectPath, path), resolve(destination, basename(path)));
}

async function assertRetainedSurfaceRedaction(
  run: PositiveRun,
  report: string,
  glb: Buffer,
  fixture: Record<string, unknown>,
  privatePaths: readonly string[],
): Promise<void> {
  const provenance = await readFile(resolve(run.projectPath, "content/generators/prop.radio.generator.json"), "utf8");
  const asset = await readFile(resolve(run.projectPath, "content/assets/prop.radio.assets.json"), "utf8");
  const glbText = glb.toString("utf8");
  const surfaces = [report, provenance, asset, glbText];
  const canaries = isRecord(fixture.redactionCanaries) ? Object.values(fixture.redactionCanaries).filter((value): value is string => typeof value === "string") : [];
  const sourceBytes = await readFile(resolve(run.projectPath, "content/references/prop.radio.png"));
  const forbidden = [
    ...privatePaths,
    run.projectPath.replaceAll("\\", "/"),
    sourceBytes.toString("base64"),
    ...canaries,
    "apiKey",
    "authorization",
    "BEGIN PRIVATE KEY",
    "TN_IMG2THREEJS_SECRET_CANARY",
  ];
  for (const value of forbidden.filter((entry) => entry !== "")) {
    if (surfaces.some((surface) => surface.toLowerCase().includes(value.toLowerCase()))) throw new Error(`retained result, provenance, asset, or GLB leaked forbidden private material '${value.slice(0, 48)}'`);
  }
  if (glb.indexOf(sourceBytes) !== -1) throw new Error("generated GLB retained raw private source-image bytes");
  if (surfaces.some((surface) => /\/tmp\/tn-img2threejs-[^\s"',)}\]]+/u.test(surface))) throw new Error("retained result, provenance, asset, or GLB leaked a private staging path");
}

async function analyzePng(path: string): Promise<{ byteSize: number; nonBackgroundFraction: number; nonblank: boolean }> {
  const bytes = await readFile(path);
  const png = PNG.sync.read(bytes);
  const background = [png.data[0]!, png.data[1]!, png.data[2]!];
  let foreground = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const delta = Math.abs(png.data[offset]! - background[0]!) + Math.abs(png.data[offset + 1]! - background[1]!) + Math.abs(png.data[offset + 2]! - background[2]!);
    if (delta > 24) foreground += 1;
  }
  const fraction = foreground / (png.width * png.height);
  return { byteSize: bytes.byteLength, nonBackgroundFraction: fraction, nonblank: bytes.byteLength > 512 && fraction > 0.001 };
}

function parseGlbJson(bytes: Buffer): Record<string, unknown> {
  if (bytes.byteLength < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(12) + 20 > bytes.byteLength || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error("generated asset is not a valid GLB 2 JSON container");
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8").trim()) as Record<string, unknown>;
}

function semanticInspection(value: Record<string, unknown>): Record<string, unknown> {
  return { bounds: value.bounds, counts: value.counts, materials: value.materials, namedNodes: value.namedNodes };
}

function validationSummary(value: Record<string, unknown>): Record<string, unknown> {
  const issues = isRecord(value.issues) ? value.issues : {};
  return { errors: issues.numErrors, hints: issues.numHints, infos: issues.numInfos, warnings: issues.numWarnings };
}

async function versionEvidence(root: string): Promise<Record<string, unknown>> {
  const [repo, cli, runtime, rust] = await Promise.all([
    readJson(resolve(root, "package.json")),
    readJson(resolve(root, "packages/cli/package.json")),
    readJson(resolve(root, "packages/runtime-web-three/package.json")),
    readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8"),
  ]);
  return { node: process.version, pnpm: repo.packageManager, cli: cli.version, runtimeWeb: runtime.version, bevy: /bevy\s*=\s*"=([^"]+)"/u.exec(rust)?.[1] ?? "0.14.2" };
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function timed<T>(timings: Record<string, number>, key: string, action: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await action(); } finally { timings[key] = Math.round(performance.now() - start); }
}

function parsePayload(result: CommandResult): Record<string, unknown> {
  const source = result.stdout.trim() || result.stderr?.trim() || "{}";
  try { return JSON.parse(source) as Record<string, unknown>; } catch { throw new Error(`command returned non-JSON output: ${source.slice(0, 240)}`); }
}

function diagnosticCode(payload: Record<string, unknown>): string {
  const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
  const first = diagnostics.find((entry) => isRecord(entry) && typeof entry.code === "string");
  return isRecord(first) && typeof first.code === "string" ? first.code : typeof payload.code === "string" ? payload.code : "UNKNOWN";
}

function requireSuccess(result: CommandResult, label: string): void {
  if (result.exitCode !== 0) throw new Error(`${label} failed: ${result.stdout || result.stderr || `exit ${result.exitCode}`}`);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`positive report omitted ${label}`);
  return value;
}

function assertEqual(left: unknown, right: unknown, message: string): void {
  if (left !== right) throw new Error(message);
}

function sha256(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sortedStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").sort() : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingCommand(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function gateDiagnostic(error: unknown, privatePaths: readonly string[]): GateDiagnostic {
  const raw = error instanceof Error ? error.message : String(error);
  const message = privatePaths.reduce((value, path) => value.replaceAll(path, "<redacted-path>"), raw)
    .replace(/\/tmp\/tn-img2threejs-[^\s"',)}\]]+/gu, "<redacted-path>");
  return {
    code: "TN_IMG2THREEJS_GATE_FAILED",
    message,
    path: "tools/verify/artifacts/img2threejs/verification-report.json",
    severity: "error",
    suggestedFix: "Run 'pnpm verify:img2threejs' and repair the owning reviewed source, provider contract, or runtime adapter indicated by the first failure.",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runImg2ThreejsGate();
  process.stdout.write(`${JSON.stringify({ code: result.ok ? "TN_IMG2THREEJS_GATE_OK" : "TN_IMG2THREEJS_GATE_FAILED", ...result }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
