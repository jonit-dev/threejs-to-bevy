import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VerificationDiagnostic } from "./runner.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const catalogRelativePath = "packages/ir/fixtures/rejected/v10-boundaries/catalog.json";

export const REQUIRED_BOUNDARY_FIXTURES: Readonly<Record<string, string>> = {
  "backend-only": "TN_IR_BACKEND_ONLY_UNSUPPORTED",
  "cloud-account-storage": "TN_IR_CLOUD_STORAGE_UNSUPPORTED",
  "custom-audio-decoder": "TN_IR_AUDIO_DECODER_PLUGIN_UNSUPPORTED",
  "direct-bevy-authoring": "TN_IR_NATIVE_AUTHORING_UNSUPPORTED",
  "network-audio-stream": "TN_IR_AUDIO_NETWORK_UNSUPPORTED",
  "online-replication": "TN_IR_NETWORKING_UNSUPPORTED",
  "online-service": "TN_IR_NETWORKING_UNSUPPORTED",
  "platform-api": "TN_IR_PLATFORM_API_UNSUPPORTED",
  "raw-three-source": "TN_IR_RAW_THREE_SOURCE_UNSUPPORTED",
  "sprite-workflow": "TN_IR_2D_WORKFLOW_UNSUPPORTED",
  "streaming-audio": "TN_IR_AUDIO_STREAMING_UNSUPPORTED",
  "two-dimensional-workflow": "TN_IR_2D_WORKFLOW_UNSUPPORTED",
};

export interface RejectedBoundaryFixture {
  expectedDiagnostic: string;
  id: string;
  ownerPrd: string;
  requiredCapabilities: Record<string, string[]>;
}

export interface RejectedBoundaryCatalog {
  fixtures: RejectedBoundaryFixture[];
  schema: string;
  version: string;
}

export interface BoundaryDiagnosticsCatalogResult {
  catalogPath: string;
  diagnostics: VerificationDiagnostic[];
  fixtureCount: number;
  ok: boolean;
}

export async function loadRejectedBoundaryCatalog(root = repoRoot): Promise<RejectedBoundaryCatalog> {
  const catalogPath = resolve(root, catalogRelativePath);
  return JSON.parse(await readFile(catalogPath, "utf8")) as RejectedBoundaryCatalog;
}

export async function verifyBoundaryDiagnosticsCatalog(root = repoRoot): Promise<BoundaryDiagnosticsCatalogResult> {
  const catalogPath = resolve(root, catalogRelativePath);
  const catalog = await loadRejectedBoundaryCatalog(root);
  const diagnostics: VerificationDiagnostic[] = [];
  const byId = new Map(catalog.fixtures.map((fixture) => [fixture.id, fixture]));

  for (const [id, expectedDiagnostic] of Object.entries(REQUIRED_BOUNDARY_FIXTURES)) {
    const fixture = byId.get(id);
    if (fixture === undefined) {
      diagnostics.push({
        code: "TN_BOUNDARY_FIXTURE_MISSING",
        message: `Rejected boundary fixture '${id}' is required.`,
        path: catalogRelativePath,
        severity: "error",
        suggestedFix: `Add a fixture with id '${id}' and expectedDiagnostic '${expectedDiagnostic}'.`,
      });
      continue;
    }
    if (fixture.expectedDiagnostic !== expectedDiagnostic) {
      diagnostics.push({
        code: "TN_BOUNDARY_FIXTURE_DIAGNOSTIC_MISMATCH",
        message: `Rejected boundary fixture '${id}' expects '${fixture.expectedDiagnostic}' instead of '${expectedDiagnostic}'.`,
        path: `${catalogRelativePath}/fixtures/${id}/expectedDiagnostic`,
        severity: "error",
        suggestedFix: `Set expectedDiagnostic to '${expectedDiagnostic}'.`,
      });
    }
    if (Object.keys(fixture.requiredCapabilities).length === 0) {
      diagnostics.push({
        code: "TN_BOUNDARY_FIXTURE_CAPABILITIES_MISSING",
        message: `Rejected boundary fixture '${id}' must declare requiredCapabilities.`,
        path: `${catalogRelativePath}/fixtures/${id}/requiredCapabilities`,
        severity: "error",
        suggestedFix: "Declare the unsupported capability token that should trigger the diagnostic.",
      });
    }
    if (!fixture.ownerPrd.startsWith("docs/PRDs/")) {
      diagnostics.push({
        code: "TN_BOUNDARY_FIXTURE_OWNER_INVALID",
        message: `Rejected boundary fixture '${id}' must point at a docs/PRDs owner.`,
        path: `${catalogRelativePath}/fixtures/${id}/ownerPrd`,
        severity: "error",
        suggestedFix: "Set ownerPrd to the PRD that owns the unsupported boundary.",
      });
      continue;
    }
    try {
      await access(resolve(root, fixture.ownerPrd));
    } catch {
      diagnostics.push({
        code: "TN_BOUNDARY_FIXTURE_OWNER_MISSING",
        message: `Rejected boundary fixture '${id}' owner PRD does not exist.`,
        path: fixture.ownerPrd,
        severity: "error",
        suggestedFix: "Move the PRD owner path or update the fixture ownerPrd.",
      });
    }
  }

  return {
    catalogPath,
    diagnostics,
    fixtureCount: catalog.fixtures.length,
    ok: diagnostics.length === 0,
  };
}
