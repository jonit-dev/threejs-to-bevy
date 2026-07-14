import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { modelTestCommand } from "@threenative/cli";
import { buildProject, validateBundle } from "@threenative/compiler";

export interface IModelTestMaterialGateReport {
  artifacts: { contactSheet: string; materialReport: string; negativeControlReport: string; negativeControlScreenshot: string; turntableManifest: string };
  diagnostics: Array<{ code: string; message: string }>;
  materialEvidence: { expected: unknown[]; observed: unknown[]; ok: boolean; verdict: string };
  negativeControl: { diagnosticCode: string; ok: boolean; reportPath: string; screenshotPath: string; verdict: string };
  ok: boolean;
  relocation: { buildPassed: boolean; from: string; packageExcerpt: Record<string, unknown>; sourceRootAbsent: boolean; to: string; validationPassed: boolean };
  schema: "threenative.verify.model-test-material";
  turntable: { angles: number[]; captures: string[] };
  version: "0.1.0";
}

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export async function runModelTestMaterialGate(options: { artifactDir?: string; fixturePath?: string } = {}): Promise<IModelTestMaterialGateReport> {
  const artifactDir = resolve(repositoryRoot, options.artifactDir ?? "tools/verify/artifacts/model-test-material");
  const fixturePath = resolve(repositoryRoot, options.fixturePath ?? "packages/cli/fixtures/model-test/colored-metallic.glb");
  const projectDir = resolve(artifactDir, "project");
  await rm(artifactDir, { force: true, recursive: true });
  await mkdir(artifactDir, { recursive: true });

  const command = await modelTestCommand([fixturePath, "--angles", "0,90,180,270", "--out", projectDir, "--json"], repositoryRoot);
  const payload = JSON.parse(command.stdout) as {
    code: string;
    materials: IModelTestMaterialGateReport["materialEvidence"];
    turntable?: { captures: Array<{ angleDegrees: number; outPath: string }>; manifestPath: string };
  };
  const diagnostics: IModelTestMaterialGateReport["diagnostics"] = [];
  if (command.exitCode !== 0 || payload.code !== "TN_MODEL_TEST_OK") diagnostics.push({ code: "TN_VERIFY_MODEL_TEST_CAPTURE_FAILED", message: command.stdout });
  if (payload.materials?.ok !== true) diagnostics.push({ code: "TN_VERIFY_MODEL_TEST_MATERIAL_MISMATCH", message: `Material verdict was '${payload.materials?.verdict ?? "missing"}'.` });
  if (payload.turntable?.captures.length !== 4) diagnostics.push({ code: "TN_VERIFY_MODEL_TEST_ANGLE_EVIDENCE_MISSING", message: "Expected four retained turntable captures." });

  const materialReportPath = resolve(artifactDir, "material-report.json");
  await writeFile(materialReportPath, `${JSON.stringify(repoRelativeValue(payload), null, 2)}\n`, "utf8");
  const contactSheetPath = resolve(artifactDir, "contact-sheet.png");
  if (payload.turntable?.captures.length === 4) await writeContactSheet(payload.turntable.captures.map((capture) => capture.outPath), contactSheetPath);

  const relocation = await relocationEvidence(fixturePath, artifactDir);
  if (!relocation.sourceRootAbsent || !relocation.buildPassed || !relocation.validationPassed) diagnostics.push({ code: "TN_VERIFY_MODEL_TEST_RELOCATION_FAILED", message: "The moved generated project did not remain path-clean, buildable, and valid." });
  const negativeControl = await negativeControlEvidence(fixturePath, artifactDir);
  if (!negativeControl.ok) diagnostics.push({ code: "TN_VERIFY_MODEL_TEST_NEGATIVE_CONTROL_FAILED", message: "White fallback negative control did not fail closed." });

  const rootLeaks = await retainedRootLeaks(artifactDir);
  relocation.sourceRootAbsent = relocation.sourceRootAbsent && rootLeaks.length === 0;
  if (rootLeaks.length > 0) diagnostics.push({ code: "TN_VERIFY_MODEL_TEST_PATH_LEAK", message: `Retained text artifacts contain the checkout root: ${rootLeaks.map(repoRelative).join(", ")}.` });

  const report: IModelTestMaterialGateReport = {
    artifacts: {
      contactSheet: repoRelative(contactSheetPath),
      materialReport: repoRelative(materialReportPath),
      negativeControlReport: negativeControl.reportPath,
      negativeControlScreenshot: negativeControl.screenshotPath,
      turntableManifest: repoRelative(payload.turntable?.manifestPath ?? ""),
    },
    diagnostics,
    materialEvidence: payload.materials,
    negativeControl,
    ok: diagnostics.length === 0,
    relocation,
    schema: "threenative.verify.model-test-material",
    turntable: {
      angles: payload.turntable?.captures.map((capture) => capture.angleDegrees) ?? [],
      captures: payload.turntable?.captures.map((capture) => repoRelative(capture.outPath)) ?? [],
    },
    version: "0.1.0",
  };
  await writeFile(resolve(artifactDir, "verification-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function negativeControlEvidence(fixturePath: string, artifactDir: string): Promise<IModelTestMaterialGateReport["negativeControl"]> {
  const outDir = resolve(artifactDir, "negative-control-project");
  const screenshotPath = resolve(outDir, "artifacts", "model-test.png");
  const reportPath = resolve(artifactDir, "negative-control-report.json");
  const ready = {
    ok: true,
    runtimeDiagnostics: {
      scene: {
        renderedEntities: [{
          id: "model.under-test.instance",
          materials: [{
            baseColor: [1, 1, 1],
            baseColorTextureLoaded: false,
            metallic: 0,
            metallicRoughnessTextureLoaded: false,
            roughness: 1,
          }],
        }],
        visibleMeshCount: 1,
      },
    },
  };
  const html = encodeURIComponent(`<!doctype html><canvas width="320" height="200"></canvas><script>const c=document.querySelector("canvas");const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);globalThis.__THREENATIVE_READY__=${JSON.stringify(ready)}</script>`);
  const command = await modelTestCommand([
    fixturePath,
    "--out", outDir,
    "--screenshot",
    "--url", `data:text/html,${html}`,
    "--verify",
    "--json",
  ], repositoryRoot);
  const payload = JSON.parse(command.stdout) as { code?: string; materials?: { verdict?: string } };
  await writeFile(reportPath, `${JSON.stringify(repoRelativeValue(payload), null, 2)}\n`, "utf8");
  return {
    diagnosticCode: payload.code ?? "missing",
    ok: command.exitCode === 1
      && payload.code === "TN_MODEL_TEST_MATERIAL_VERIFY_FAILED"
      && payload.materials?.verdict === "fallback-only",
    reportPath: repoRelative(reportPath),
    screenshotPath: repoRelative(screenshotPath),
    verdict: payload.materials?.verdict ?? "missing",
  };
}

async function relocationEvidence(fixturePath: string, artifactDir: string): Promise<IModelTestMaterialGateReport["relocation"]> {
  const from = resolve(artifactDir, "relocation-from", "proof");
  const to = resolve(artifactDir, "relocation-to", "proof");
  const generated = await modelTestCommand([fixturePath, "--out", from, "--json"], repositoryRoot);
  if (generated.exitCode !== 0) throw new Error(generated.stdout);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  const packageText = await readFile(resolve(to, "package.json"), "utf8");
  const packageExcerpt = JSON.parse(packageText) as Record<string, unknown>;
  const build = await buildProject(to);
  const validation = await validateBundle(build.bundlePath);
  return {
    buildPassed: true,
    from: repoRelative(resolve(artifactDir, "relocation-from")),
    packageExcerpt,
    sourceRootAbsent: !packageText.includes(repositoryRoot) && !packageText.includes("file:/"),
    to: repoRelative(resolve(artifactDir, "relocation-to")),
    validationPassed: validation.ok,
  };
}

async function writeContactSheet(paths: string[], outputPath: string): Promise<void> {
  const frames = await Promise.all(paths.map(async (path) => PNG.sync.read(await readFile(path))));
  const width = Math.max(...frames.map((frame) => frame.width));
  const height = Math.max(...frames.map((frame) => frame.height));
  const sheet = new PNG({ height: height * 2, width: width * 2 });
  sheet.data.fill(18);
  frames.forEach((frame, index) => PNG.bitblt(frame, sheet, 0, 0, frame.width, frame.height, (index % 2) * width, Math.floor(index / 2) * height));
  await writeFile(outputPath, PNG.sync.write(sheet));
}

function repoRelative(path: string): string {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function repoRelativeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.includes(repositoryRoot) ? value.replaceAll(repositoryRoot, "").replace(/^\/+/, "") : value;
  }
  if (Array.isArray(value)) return value.map(repoRelativeValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, repoRelativeValue(child)]));
  }
  return value;
}

async function retainedRootLeaks(root: string): Promise<string[]> {
  const leaks: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (/\.(?:css|html|js|json|md|ts|txt)$/u.test(entry.name)) {
        if ((await readFile(path, "utf8")).includes(repositoryRoot)) leaks.push(path);
      }
    }
  };
  await visit(root);
  return leaks;
}

async function main(): Promise<void> {
  const report = await runModelTestMaterialGate();
  process.stdout.write(`${JSON.stringify({ code: report.ok ? "TN_VERIFY_MODEL_TEST_MATERIAL_OK" : "TN_VERIFY_MODEL_TEST_MATERIAL_FAILED", reportPath: "tools/verify/artifacts/model-test-material/verification-report.json", ...report }, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
