import { relative, resolve } from "node:path";

export function resolveArtifactTargets({ gate, legacyDirs = [], linkedArtifacts = {}, owner, root }) {
  const relativeDir = artifactDirForOwner(gate, owner);
  const absoluteDir = resolve(root, relativeDir);
  const relativeReportPath = `${relativeDir}/verification-report.json`;
  return {
    absoluteDir,
    metadata: {
      artifactOwner: owner,
      canonicalArtifactDir: relativeDir,
      legacyArtifactDirs: legacyDirs.map((entry) => toRepoRelative(root, entry)),
      linkedArtifacts: Object.fromEntries(
        Object.entries(linkedArtifacts).map(([key, path]) => [key, toRepoRelative(root, path)]),
      ),
    },
    reportPath: resolve(root, relativeReportPath),
    relativeDir,
    relativeReportPath,
  };
}

export function toRepoRelative(root, path) {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized)) {
    return normalized.replace(/^\.?\//, "");
  }
  return relative(root, path).replaceAll("\\", "/");
}

function artifactDirForOwner(gate, owner) {
  if (owner.kind === "aggregate") {
    return `tools/verify/artifacts/${owner.name ?? gate}`;
  }
  if (owner.kind === "example") {
    return `examples/${owner.exampleName}/artifacts/${gate}`;
  }
  if (owner.kind === "package") {
    return `${owner.packagePath.replace(/\/$/, "")}/artifacts/${gate}`;
  }
  if (owner.kind === "runtime") {
    return `${owner.runtimeName.replace(/\/$/, "")}/artifacts/${gate}`;
  }
  throw new Error(`Unknown artifact owner kind: ${owner.kind}`);
}
