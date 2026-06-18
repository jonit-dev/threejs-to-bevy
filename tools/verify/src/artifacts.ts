import { relative, resolve } from "node:path";

export type ArtifactOwner =
  | { kind: "aggregate"; name?: string }
  | { kind: "example"; exampleName: string }
  | { kind: "package"; packagePath: string }
  | { kind: "runtime"; runtimeName: string };

export interface ArtifactTargetOptions {
  gate: string;
  owner: ArtifactOwner;
  root: string;
  legacyDirs?: string[];
  linkedArtifacts?: Record<string, string>;
}

export interface ArtifactTargetMetadata {
  artifactOwner: ArtifactOwner;
  canonicalArtifactDir: string;
  legacyArtifactDirs: string[];
  linkedArtifacts: Record<string, string>;
}

export interface ArtifactTargets {
  absoluteDir: string;
  metadata: ArtifactTargetMetadata;
  reportPath: string;
  relativeDir: string;
  relativeReportPath: string;
}

export function resolveArtifactTargets(options: ArtifactTargetOptions): ArtifactTargets {
  const relativeDir = artifactDirForOwner(options.gate, options.owner);
  const absoluteDir = resolve(options.root, relativeDir);
  const relativeReportPath = `${relativeDir}/verification-report.json`;

  return {
    absoluteDir,
    metadata: {
      artifactOwner: options.owner,
      canonicalArtifactDir: relativeDir,
      legacyArtifactDirs: (options.legacyDirs ?? []).map((entry) => toRepoRelative(options.root, entry)),
      linkedArtifacts: normalizeLinkedArtifacts(options.root, options.linkedArtifacts ?? {}),
    },
    reportPath: resolve(options.root, relativeReportPath),
    relativeDir,
    relativeReportPath,
  };
}

export function toRepoRelative(root: string, path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized)) {
    return normalized.replace(/^\.?\//, "");
  }
  return relative(root, path).replaceAll("\\", "/");
}

function artifactDirForOwner(gate: string, owner: ArtifactOwner): string {
  switch (owner.kind) {
    case "aggregate":
      return `tools/verify/artifacts/${owner.name ?? gate}`;
    case "example":
      return `examples/${owner.exampleName}/artifacts/${gate}`;
    case "package":
      return `${owner.packagePath.replace(/\/$/, "")}/artifacts/${gate}`;
    case "runtime":
      return `${owner.runtimeName.replace(/\/$/, "")}/artifacts/${gate}`;
  }
}

function normalizeLinkedArtifacts(root: string, linkedArtifacts: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(linkedArtifacts).map(([key, path]) => [key, toRepoRelative(root, path)]),
  );
}
