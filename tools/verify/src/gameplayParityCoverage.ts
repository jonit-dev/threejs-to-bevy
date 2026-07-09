import {
  type GameplayParityAssertionResult,
  type GameplayParityDiagnostic,
  type GameplayParityRequiredSurfaces,
  type GameplayParitySceneCoverageEntry,
  type GameplayParitySurfaceExclusion,
  type GameplayParitySurfaceRef,
} from "./gameplayParityManifest.js";

export interface GameplayParityCoverageSummary {
  assertedSurfaces: number;
  coveragePercent: number;
  coverageStatus: "pass" | "fail";
  diagnostics: GameplayParityDiagnostic[];
  reportOnlySurfaces: number;
  requiredSurfaces: number;
  unsupportedSurfaces: number;
  uncoveredSurfaces: string[];
}

export function auditGameplayParityCoverage(
  entry: GameplayParitySceneCoverageEntry,
  assertionResults: readonly GameplayParityAssertionResult[] = [],
): GameplayParityCoverageSummary {
  const required = flattenRequiredSurfaces(entry.requiredSurfaces);
  const asserted = new Set([
    ...entry.assertions.map((assertion) => normalizeSurface(assertion.surface)),
    ...assertionResults.map((assertion) => assertion.surface),
  ]);
  const reportOnly = normalizeExclusions(entry.coverage?.reportOnly ?? [], `${entry.id}.coverage.reportOnly`);
  const unsupported = normalizeExclusions(entry.coverage?.unsupported ?? [], `${entry.id}.coverage.unsupported`);
  const excluded = new Set([...reportOnly.keys(), ...unsupported.keys()]);
  const diagnostics: GameplayParityDiagnostic[] = [...reportOnly.diagnostics, ...unsupported.diagnostics];
  const uncoveredSurfaces = required.filter((surface) => !asserted.has(surface) && !excluded.has(surface));

  for (const surface of uncoveredSurfaces) {
    diagnostics.push({
      code: "TN_RUNTIME_PARITY_COVERAGE_GAP",
      message: `Required scene surface '${surface}' is not covered by a pass/fail assertion or explicit non-passing exclusion.`,
      severity: "error",
      suggestedFix: "Add an assertion row for this surface, or list it under reportOnly/unsupported with a stable reason.",
    });
  }

  const coveredCount = required.filter((surface) => asserted.has(surface)).length;
  const coveragePercent = required.length === 0 ? 100 : Number(((coveredCount / required.length) * 100).toFixed(2));

  return {
    assertedSurfaces: coveredCount,
    coveragePercent,
    coverageStatus: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : "pass",
    diagnostics,
    reportOnlySurfaces: reportOnly.keys().length,
    requiredSurfaces: required.length,
    uncoveredSurfaces,
    unsupportedSurfaces: unsupported.keys().length,
  };
}

export function flattenRequiredSurfaces(required: GameplayParityRequiredSurfaces): string[] {
  const surfaces: string[] = [];
  for (const [type, ids] of Object.entries(required) as Array<[keyof GameplayParityRequiredSurfaces, readonly string[] | undefined]>) {
    for (const id of ids ?? []) {
      surfaces.push(`${type}:${id}`);
    }
  }
  return surfaces.sort();
}

export function normalizeSurface(surface: GameplayParitySurfaceRef | string): string {
  return typeof surface === "string" ? surface : `${surface.type}:${surface.id}`;
}

function normalizeExclusions(
  exclusions: readonly GameplayParitySurfaceExclusion[],
  path: string,
): { diagnostics: GameplayParityDiagnostic[]; keys: () => string[] } {
  const diagnostics: GameplayParityDiagnostic[] = [];
  const keys: string[] = [];
  for (const [index, exclusion] of exclusions.entries()) {
    const surface = normalizeSurface(exclusion.surface);
    keys.push(surface);
    if (exclusion.reason.trim().length === 0) {
      diagnostics.push({
        code: "TN_RUNTIME_PARITY_COVERAGE_REASON_MISSING",
        message: `Scene surface '${surface}' is excluded without a stable reason.`,
        path: `${path}[${index}].reason`,
        severity: "error",
        suggestedFix: "Document why this surface is report-only or unsupported; exclusions cannot contribute to pass claims.",
      });
    }
  }
  return { diagnostics, keys: () => keys };
}
