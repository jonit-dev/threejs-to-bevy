import { setMaterial, setRuntimeRendering, type IAuthoringDiagnostic, type IAuthoringOperationResult } from "@threenative/authoring";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { formatLookProfileUsage, getLookProfile, lookProfiles, type ILookProfileDefinition } from "../lookProfiles/registry.js";
import { normalizeArgv, readPositional, resolveProjectPath } from "./sourceCommandUtils.js";

export async function lookCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const json = normalizedArgv.includes("--json");
  const subcommand = readPositional(normalizedArgv, 0);

  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    return renderLookUsage(json);
  }

  if (subcommand === "list") {
    const payload = {
      code: "TN_LOOK_LIST_OK",
      profiles: lookProfiles.map((profile) => ({ id: profile.id, summary: profile.summary })),
    };
    return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.profiles.map((profile) => `${profile.id}: ${profile.summary}`).join("\n")}\n` };
  }

  if (subcommand === "apply") {
    const profileId = readPositional(normalizedArgv, 1);
    if (profileId === undefined) {
      return diagnosticResult(
        {
          code: "TN_LOOK_PROFILE_REQUIRED",
          message: `Usage: tn look apply <${formatLookProfileUsage()}> [--project <path>] [--json]`,
        },
        { exitCode: 2, json },
      );
    }
    const profile = getLookProfile(profileId);
    if (profile === undefined) {
      return diagnosticResult(
        {
          code: "TN_LOOK_PROFILE_UNKNOWN",
          message: `Unknown look profile '${profileId}'. Supported profiles: ${formatLookProfileUsage()}.`,
          profile: profileId,
        },
        { exitCode: 1, json, stderr: !json },
      );
    }
    return applyLookProfile(profile, resolveProjectPath(normalizedArgv), json);
  }

  return diagnosticResult(
    {
      code: "TN_LOOK_COMMAND_UNKNOWN",
      message: `Usage: tn look list [--json]\n       tn look apply <${formatLookProfileUsage()}> [--project <path>] [--json]`,
    },
    { exitCode: 2, json },
  );
}

async function applyLookProfile(profile: ILookProfileDefinition, projectPath: string, json: boolean): Promise<ICommandResult> {
  const runtime = await setRuntimeRendering({
    antialias: "msaa4",
    projectPath,
    renderLookBloomIntensity: profile.renderLook.bloomIntensity,
    renderLookContrast: profile.renderLook.contrast,
    renderLookEnvironmentIntensity: profile.renderLook.environmentIntensity,
    renderLookExposure: profile.renderLook.exposure,
    renderLookSaturation: profile.renderLook.saturation,
    renderLookShadowQuality: profile.renderLook.shadowQuality,
    renderProfile: "balanced",
    runtimeId: "default",
  });
  const materialResults: IAuthoringOperationResult[] = [];
  for (const material of profile.materials) {
    materialResults.push(
      await setMaterial({
        color: material.color,
        emissive: material.emissive,
        emissiveIntensity: material.emissiveIntensity,
        materialId: material.id,
        metalness: material.metalness,
        projectPath,
        roughness: material.roughness,
      }),
    );
  }

  const hardFailures = [runtime, ...materialResults].filter((result) => result.diagnostics.some((diagnostic) => diagnostic.severity === "error" && diagnostic.code !== "TN_AUTHORING_DOCUMENT_MISSING"));
  const missingMaterialWarnings = materialResults.flatMap((result) => missingMaterialDiagnostics(result));
  if (runtime.ok === false || hardFailures.length > 0) {
    const diagnostics = [runtime, ...materialResults].flatMap((result) => result.diagnostics);
    const payload = {
      changed: false,
      code: "TN_LOOK_APPLY_FAILED",
      diagnostics,
      message: `Look profile '${profile.id}' could not be applied.`,
      ok: false,
      profile: profile.id,
      projectPath,
    };
    return { exitCode: 1, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
  }

  const filesWritten = unique([runtime, ...materialResults].flatMap((result) => result.filesWritten));
  const payload = {
    changed: [runtime, ...materialResults].some((result) => result.changed),
    code: "TN_LOOK_APPLY_OK",
    diagnostics: missingMaterialWarnings,
    filesWritten,
    message: `Applied look profile '${profile.id}'.`,
    ok: true,
    profile: profile.id,
    proofCommand: "tn authoring validate --project . --json",
    projectPath,
    renderProfile: "balanced",
  };

  if (json) {
    return { exitCode: 0, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }
  const warnings = missingMaterialWarnings.length === 0 ? "" : `Warnings:\n${missingMaterialWarnings.map((diagnostic) => `  ${diagnostic.message}`).join("\n")}\n`;
  return { exitCode: 0, stdout: `${payload.message}\n${warnings}Proof: ${payload.proofCommand}\n` };
}

function missingMaterialDiagnostics(result: IAuthoringOperationResult): IAuthoringDiagnostic[] {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.code === "TN_AUTHORING_DOCUMENT_MISSING")
    .map((diagnostic) => ({
      ...diagnostic,
      message: `${diagnostic.message} Look profile material override skipped.`,
      severity: "warning" as const,
    }));
}

function renderLookUsage(json: boolean): ICommandResult {
  const payload = {
    code: "TN_LOOK_USAGE",
    message: `Usage: tn look list [--json]\n       tn look apply <${formatLookProfileUsage()}> [--project <path>] [--json]`,
    profiles: lookProfiles.map((profile) => ({ id: profile.id, summary: profile.summary })),
  };
  return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
