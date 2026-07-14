export interface ICredentialHandle {
  readonly reference: string;
  readonly value: string;
}

export type DistributionSigningStatus = "not-applicable" | "unsigned" | "signed";

export function createCredentialHandle(reference: string, value: string): ICredentialHandle {
  if (!/^(?:ci|env|keychain):/.test(reference)) throw new Error("TN_PACKAGE_CREDENTIAL_REF_INVALID: Credential handles require a provider-qualified reference.");
  if (value.length < 8) throw new Error("TN_PACKAGE_CREDENTIAL_VALUE_INVALID: Credential values must not be empty or trivially short.");
  return Object.freeze({ reference, value });
}

export function resolveCredentialHandle(reference: string, env: NodeJS.ProcessEnv = process.env): ICredentialHandle {
  const separator = reference.indexOf(":");
  const provider = reference.slice(0, separator);
  const identifier = reference.slice(separator + 1);
  const variable = provider === "env"
    ? identifier
    : provider === "ci"
      ? `THREENATIVE_CREDENTIAL_${identifier.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`
      : undefined;
  if (variable === undefined) {
    throw new Error(`TN_PACKAGE_CREDENTIAL_PROVIDER_UNAVAILABLE: Credential provider '${provider}' is unavailable on this host.`);
  }
  const value = env[variable];
  if (value === undefined) throw new Error(`TN_PACKAGE_CREDENTIAL_REQUIRED: Credential provider variable '${variable}' is not available.`);
  return createCredentialHandle(reference, value);
}

export function signingStatus(options: {
  credential?: ICredentialHandle;
  release: boolean;
  signable: boolean;
  unsigned: boolean;
}): DistributionSigningStatus {
  if (!options.signable) return "not-applicable";
  if (options.release && !options.unsigned && options.credential === undefined) {
    throw new Error("TN_PACKAGE_CREDENTIAL_REQUIRED: Release signing requires an explicit credential provider handle.");
  }
  return options.credential === undefined || options.unsigned ? "unsigned" : "signed";
}

export function redactCredentialCanaries(value: unknown, credentials: readonly ICredentialHandle[]): unknown {
  const canaries = credentials.map(({ value: secret }) => secret).filter(Boolean);
  if (typeof value === "string") return redactString(value, canaries);
  if (Array.isArray(value)) return value.map((entry) => redactCredentialCanaries(entry, credentials));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactCredentialCanaries(entry, credentials)]));
  }
  return value;
}

export function assertCredentialCanariesAbsent(surfaces: readonly (string | Uint8Array)[], credentials: readonly ICredentialHandle[]): void {
  for (const { value } of credentials) {
    for (const surface of surfaces) {
      const text = typeof surface === "string" ? surface : Buffer.from(surface).toString("utf8");
      if (text.includes(value)) throw new Error("TN_PACKAGE_SECRET_LEAK: Credential canary appeared in a distribution output surface.");
    }
  }
}

function redactString(value: string, canaries: readonly string[]): string {
  return canaries.reduce((text, canary) => text.split(canary).join("[REDACTED]"), value);
}
