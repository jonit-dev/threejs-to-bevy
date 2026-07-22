export const ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION = "0.1.0";

const HASH_PATTERN = /^sha256-[0-9a-f]{64}$/;

export function advancedPhysicsEvidenceMetadataDiagnostics(value: unknown): string[] {
  if (!isRecord(value)) return ["metadata must be an object"];
  const diagnostics: string[] = [];
  requireString(value, "schemaVersion", diagnostics);
  requireHash(value, "sourceHash", diagnostics);
  requireHash(value, "bundleHash", diagnostics);
  requireString(value, "platform", diagnostics);
  requireString(value, "scenario", diagnostics);
  requireNumber(value, "fixedDelta", diagnostics);
  requireNumber(value, "seed", diagnostics);
  requireString(value, "toleranceRegistryVersion", diagnostics);
  requireString(value, "command", diagnostics);
  requireTimestamp(value, "startedAt", diagnostics);
  requireTimestamp(value, "completedAt", diagnostics);
  if (!Array.isArray(value.adapters) || value.adapters.length !== 2) {
    diagnostics.push("adapters must contain web and bevy metadata");
  }
  if (Array.isArray(value.adapters)) {
    const names = value.adapters.filter(isRecord).map((adapter) => adapter.adapter).sort();
    if (JSON.stringify(names) !== JSON.stringify(["bevy", "web"])) diagnostics.push("adapters must identify web and bevy");
    value.adapters.forEach((adapter, index) => {
      if (!isRecord(adapter)) {
        diagnostics.push(`adapters/${index} must be an object`);
        return;
      }
      requireString(adapter, "runtime", diagnostics, `adapters/${index}/`);
      requireVersion(adapter, "runtimeVersion", diagnostics, `adapters/${index}/`);
      if (!isRecord(adapter.dependencies) || Object.keys(adapter.dependencies).length === 0 || Object.values(adapter.dependencies).some((version) => typeof version !== "string" || version.length === 0 || version === "unknown")) {
        diagnostics.push(`adapters/${index}/dependencies must contain versioned dependencies`);
      }
    });
  }
  if (!isRecord(value.artifactHashes) || Object.keys(value.artifactHashes).length === 0) {
    diagnostics.push("artifactHashes must contain evidence artifact hashes");
  } else {
    for (const [path, hash] of Object.entries(value.artifactHashes)) {
      if (!HASH_PATTERN.test(String(hash))) diagnostics.push(`artifactHashes/${path} must be a sha256 hash`);
    }
  }
  return diagnostics;
}

function requireVersion(value: Record<string, unknown>, key: string, diagnostics: string[], prefix = ""): void {
  if (typeof value[key] !== "string" || value[key].length === 0 || value[key] === "unknown") diagnostics.push(`${prefix}${key} must be a resolved version`);
}

function requireString(value: Record<string, unknown>, key: string, diagnostics: string[], prefix = ""): void {
  if (typeof value[key] !== "string" || value[key].length === 0) diagnostics.push(`${prefix}${key} must be a non-empty string`);
}

function requireHash(value: Record<string, unknown>, key: string, diagnostics: string[]): void {
  if (!HASH_PATTERN.test(String(value[key]))) diagnostics.push(`${key} must be a sha256 hash`);
}

function requireNumber(value: Record<string, unknown>, key: string, diagnostics: string[]): void {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) diagnostics.push(`${key} must be finite`);
}

function requireTimestamp(value: Record<string, unknown>, key: string, diagnostics: string[]): void {
  if (typeof value[key] !== "string" || !Number.isFinite(Date.parse(value[key]))) diagnostics.push(`${key} must be an ISO timestamp`);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
