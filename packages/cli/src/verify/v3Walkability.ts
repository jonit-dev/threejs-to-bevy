import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, resolveWalkableMovement } from "@threenative/runtime-web-three";

export interface IV3WalkabilityReport {
  artifacts: { reportPath: string };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  probes: Array<{
    blockedBy?: string;
    desired: readonly number[];
    expectedBlocked: boolean;
    expectedBlockedBy?: string;
    id: string;
    passed: boolean;
    position: readonly number[];
    start: readonly number[];
  }>;
  status: "fail" | "pass";
}

export async function verifyV3Walkability(options: { artifactDir: string; bundlePath: string }): Promise<IV3WalkabilityReport> {
  const bundle = await loadBundle(options.bundlePath);
  const walkability = bundle.environmentScene?.walkability;
  const diagnostics: IV3WalkabilityReport["diagnostics"] = [];
  if (walkability === undefined) {
    diagnostics.push({ code: "TN_V3_WALKABILITY_MISSING", message: "V3 walkability verification requires walkability data.", severity: "error" });
  }
  const probes =
    walkability === undefined
      ? []
      : [
          {
            id: "path-center",
            desired: [0, 0, 0] as const,
            expectedBlocked: false,
            expectedBlockedBy: undefined,
            start: [0, 0, 1] as const,
          },
          {
            id: "path-edge",
            desired: [99, 0, 0] as const,
            expectedBlocked: true,
            expectedBlockedBy: "walkable-boundary",
            start: [0, 0, 1] as const,
          },
          {
            id: "blocking-prop",
            desired: bundle.environmentScene?.instances.find((instance) => instance.id === walkability.blockers[0]?.instance)?.position ?? ([0, 0, 0] as const),
            expectedBlocked: true,
            expectedBlockedBy: walkability.blockers[0]?.id,
            start: [0, 0, 1] as const,
          },
        ].map((probe) => {
          const result = resolveWalkableMovement({
            desired: probe.desired,
            instances: bundle.environmentScene?.instances,
            start: probe.start,
            walkability,
          });
          return {
            blockedBy: result.blockedBy,
            desired: probe.desired,
            expectedBlocked: probe.expectedBlocked,
            expectedBlockedBy: probe.expectedBlockedBy,
            id: probe.id,
            passed:
              result.blockedBy === probe.expectedBlockedBy ||
              (probe.expectedBlockedBy === undefined && (probe.expectedBlocked ? result.blockedBy !== undefined : result.blockedBy === undefined)),
            position: result.position,
            start: probe.start,
          };
        });
  for (const probe of probes) {
    if (!probe.passed) {
      diagnostics.push({ code: "TN_V3_WALKABILITY_PROBE_FAILED", message: `Walkability probe '${probe.id}' failed.`, severity: "error" });
    }
  }
  const reportPath = resolve(options.artifactDir, "v3-walkability-report.json");
  const report: IV3WalkabilityReport = {
    artifacts: { reportPath },
    diagnostics,
    probes,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
