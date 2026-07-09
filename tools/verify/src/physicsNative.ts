import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const artifactDir = resolve(root, "tools/verify/artifacts/feature-parity-physics-native");
const reportPath = resolve(artifactDir, "verification-report.json");
const selfReportPath = resolve(root, "tools/verify/artifacts/physics-self-verification/verification-report.json");
const residualReportPath = resolve(root, "tools/verify/artifacts/animation-physics-residuals/verification-report.json");

export interface PhysicsNativeGateResult {
  diagnostics: string[];
  ok: boolean;
  reportPath: string;
}

export function validatePhysicsNativeEvidence(selfReport: any, residualReport: any): string[] {
  const diagnostics: string[] = [];
  if (selfReport?.conclusion !== "PASS") diagnostics.push("physics-self-verification:not-pass");
  if (residualReport?.status !== "passed" || residualReport?.ok !== true) diagnostics.push("animation-physics-residuals:not-pass");

  const scenes = new Map((selfReport?.sceneRows ?? []).map((row: any) => [row.scene, row]));
  for (const scene of ["physics-material-lab", "physics-mass-stack-lab", "physics-character-obstacles", "physics-query-lab", "physics-mesh-ccd-track"]) {
    const row = scenes.get(scene) as any;
    if (row?.ok !== true) diagnostics.push(`${scene}:not-pass`);
    if (typeof row?.artifacts?.traceSidecar !== "string") diagnostics.push(`${scene}:missing-contact-sidecar`);
  }

  const promoted = new Set(residualReport?.promoted ?? []);
  for (const claim of ["sloped mesh grounding", "bounded dynamic navmesh rebake", "off-mesh links", "small crowd steering"]) {
    if (!promoted.has(claim)) diagnostics.push(`navigation-residual:missing:${claim}`);
  }

  const negativeCodes = new Set((selfReport?.negativeFixtures ?? []).filter((row: any) => row.ok === true).map((row: any) => row.expectedCode));
  for (const code of ["TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED", "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID", "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED"]) {
    if (!negativeCodes.has(code)) diagnostics.push(`boundary:missing:${code}`);
  }
  return diagnostics;
}

export async function runPhysicsNativeGate(): Promise<PhysicsNativeGateResult> {
  const [selfReport, residualReport] = await Promise.all([
    readJson(selfReportPath),
    readJson(residualReportPath),
  ]);
  const diagnostics = validatePhysicsNativeEvidence(selfReport, residualReport);
  const report = {
    artifacts: {
      animationPhysicsResiduals: residualReportPath,
      physicsSelfVerification: selfReportPath,
      report: reportPath,
    },
    boundaries: ["full constraints", "vehicles", "soft bodies", "ragdolls", "arbitrary triangle narrow phase", "public backend handles"],
    code: diagnostics.length === 0 ? "TN_VERIFY_PHYSICS_NATIVE_OK" : "TN_VERIFY_PHYSICS_NATIVE_FAILED",
    diagnostics: diagnostics.map((message) => ({ code: "TN_VERIFY_PHYSICS_NATIVE_EVIDENCE_MISSING", message, severity: "error" })),
    generatedBy: "tools/verify/src/physicsNative.ts",
    ok: diagnostics.length === 0,
    schema: "threenative.verify.feature-parity-physics-native",
    status: diagnostics.length === 0 ? "pass" : "fail",
    version: "0.1.0",
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { diagnostics, ok: report.ok, reportPath };
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

if (process.argv[1]?.endsWith("physicsNative.js")) {
  const result = await runPhysicsNativeGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
