import { validateBundleRelativePath } from "./bundlePaths.js";
import type { ITargetProfile } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

export const DISTRIBUTION_PLATFORMS = ["web", "windows", "macos", "linux", "android", "ios"] as const;
export const DISTRIBUTION_RUNTIMES = ["web", "bevy", "webview"] as const;
export const DISTRIBUTION_FORMATS = ["static", "zip", "pwa", "archive", "nsis", "app", "dmg", "tar", "appimage", "aab", "apk", "xcarchive", "ipa"] as const;
export const DISTRIBUTION_ARCHITECTURES = ["x86_64", "arm64", "universal", "simulator"] as const;
export const DISTRIBUTION_CAPABILITIES = ["camera", "microphone", "network", "storage", "gamepad", "vibration"] as const;
export const DISTRIBUTION_CHANNELS = ["development", "direct", "store"] as const;

export type DistributionPlatform = (typeof DISTRIBUTION_PLATFORMS)[number];
export type DistributionRuntime = (typeof DISTRIBUTION_RUNTIMES)[number];
export type DistributionFormat = (typeof DISTRIBUTION_FORMATS)[number];
export type DistributionArchitecture = (typeof DISTRIBUTION_ARCHITECTURES)[number];
export type DistributionCapability = (typeof DISTRIBUTION_CAPABILITIES)[number];
export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];
export type DistributionHost = "any" | "linux" | "macos" | "windows";
export type DistributionPromotion = "planned" | "implemented" | "promoted";

export interface IDistributionRegistryRow {
  architectures: readonly DistributionArchitecture[];
  eligibleHosts: readonly DistributionHost[];
  formats: readonly DistributionFormat[];
  platform: DistributionPlatform;
  promotion: DistributionPromotion;
  proofRequirements: readonly string[];
  requiredTools: readonly string[];
  runtime: DistributionRuntime;
  signable: boolean;
}

export const DISTRIBUTION_TARGET_REGISTRY = [
  row("web", "web", ["static", "zip", "pwa"], ["any"], ["node"], false, ["offline-launch", "first-frame", "input", "local-assets"], "implemented"),
  row("windows", "bevy", ["archive", "nsis"], ["windows"], ["cargo", "rustc"], true, ["native-host-install", "launch", "first-frame", "input", "local-assets"]),
  row("windows", "webview", ["archive", "nsis"], ["windows"], ["cargo", "rustc", "tauri"], true, ["native-host-install", "embedded-webview", "launch", "first-frame", "input", "local-assets"]),
  row("macos", "bevy", ["app", "dmg"], ["macos"], ["cargo", "rustc", "xcodebuild"], true, ["native-host-install", "signature", "notarization", "launch", "first-frame", "input", "local-assets"]),
  row("macos", "webview", ["app", "dmg"], ["macos"], ["cargo", "rustc", "tauri", "xcodebuild"], true, ["native-host-install", "embedded-webview", "signature", "notarization", "launch", "first-frame", "input", "local-assets"]),
  row("linux", "bevy", ["tar", "appimage"], ["linux"], ["cargo", "rustc"], false, ["native-host-install", "launch", "first-frame", "input", "local-assets"], "implemented", ["x86_64"]),
  row("linux", "webview", ["tar", "appimage"], ["linux"], ["appimagetool", "cargo", "rustc", "tauri"], false, ["native-host-install", "embedded-webview", "launch", "first-frame", "input", "local-assets"], "implemented", ["x86_64"]),
  row("android", "bevy", ["aab", "apk"], ["linux", "macos", "windows"], ["android-sdk", "cargo", "jdk", "ndk", "rustc"], true, mobileProof("native-parity")),
  row("android", "webview", ["aab", "apk"], ["linux", "macos", "windows"], ["android-sdk", "cargo", "jdk", "ndk", "rustc", "tauri"], true, mobileProof("embedded-webview"), "implemented", ["x86_64", "arm64"]),
  row("ios", "bevy", ["xcarchive", "ipa"], ["macos"], ["cargo", "rustc", "xcodebuild"], true, mobileProof("native-parity")),
  row("ios", "webview", ["xcarchive", "ipa"], ["macos"], ["cargo", "rustc", "tauri", "xcodebuild"], true, mobileProof("embedded-webview")),
] as const satisfies readonly IDistributionRegistryRow[];

export interface IDistributionApp {
  buildNumber: number;
  displayName: string;
  icons: string;
  id: string;
  privacyPolicyUrl?: string;
  splash?: string;
  version: string;
}

export interface IDistributionTarget {
  architecture?: DistributionArchitecture;
  capabilities?: DistributionCapability[];
  channel?: DistributionChannel;
  formats: DistributionFormat[];
  minimumOs?: string;
  platform: DistributionPlatform;
  runtime: DistributionRuntime;
}

export interface IDistributionSigningReference {
  credentialRef: string;
}

export interface IDistributionSource {
  app: IDistributionApp;
  schema: "threenative.distribution";
  signing?: {
    android?: IDistributionSigningReference;
    apple?: IDistributionSigningReference;
    windows?: IDistributionSigningReference;
  };
  targets: IDistributionTarget[];
  version: "0.1.0";
}

const SECRET_FIELD = /(api.?key|certificate|keystore|password|private|profile|secret|token|key(?:path|file|value)?)/i;
const CREDENTIAL_REF = /^(?:ci|env|keychain):[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const APP_ID = /^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9-]*){1,}$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function distributionRegistryRow(platform: DistributionPlatform, runtime: DistributionRuntime): IDistributionRegistryRow | undefined {
  return DISTRIBUTION_TARGET_REGISTRY.find((candidate) => candidate.platform === platform && candidate.runtime === runtime);
}

export function validateDistribution(
  value: unknown,
  path = "content/distribution.json",
  targetProfile?: Pick<ITargetProfile, "targets">,
): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (!isRecord(value)) {
    return [diagnostic("TN_IR_DISTRIBUTION_DOCUMENT_INVALID", path, "Distribution source must be a JSON object.")];
  }
  if (value.schema !== "threenative.distribution") {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_SCHEMA_INVALID", `${path}/schema`, "Distribution schema must be 'threenative.distribution'."));
  }
  if (value.version !== "0.1.0") {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_VERSION_INVALID", `${path}/version`, "Distribution version must be '0.1.0'."));
  }
  validateFields(value, ["app", "schema", "signing", "targets", "version"], path, diagnostics);
  validateApp(value.app, `${path}/app`, diagnostics);
  validateTargets(value.targets, `${path}/targets`, diagnostics, targetProfile);
  validateSigning(value.signing, `${path}/signing`, diagnostics);
  return diagnostics;
}

export async function validateDistributionProjectPaths(
  value: unknown,
  projectRoot: string,
  path = "content/distribution.json",
): Promise<IIrDiagnostic[]> {
  if (!isRecord(value) || !isRecord(value.app)) return [];
  const [{ realpath }, { isAbsolute, relative, resolve, sep }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const nearestExistingPath = async (path: string): Promise<string> => {
    let candidate = path;
    while (true) {
      try {
        return await realpath(candidate);
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
        const parent = resolve(candidate, "..");
        if (parent === candidate) throw error;
        candidate = parent;
      }
    }
  };
  const pathIsInside = (root: string, candidate: string): boolean => {
    const pathFromRoot = relative(root, candidate);
    return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
  };
  const diagnostics: IIrDiagnostic[] = [];
  const canonicalRoot = await realpath(projectRoot);
  for (const field of ["icons", "splash"] as const) {
    const candidate = value.app[field];
    if (typeof candidate !== "string" || !validateBundleRelativePath(candidate).ok) continue;
    const existingAncestor = await nearestExistingPath(resolve(canonicalRoot, candidate));
    if (!pathIsInside(canonicalRoot, existingAncestor)) {
      diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_PATH_SYMLINK_ESCAPE", `${path}/app/${field}`, `Distribution ${field} path resolves outside the project root through a symbolic link.`));
    }
  }
  return diagnostics;
}

export function normalizeDistribution(value: unknown): IDistributionSource {
  const source = isRecord(value) ? value : {};
  const app = isRecord(source.app) ? source.app : {};
  const targets = Array.isArray(source.targets) ? source.targets : [];
  const normalized: IDistributionSource = {
    app: {
      buildNumber: typeof app.buildNumber === "number" ? app.buildNumber : 0,
      displayName: typeof app.displayName === "string" ? app.displayName.trim() : "",
      icons: typeof app.icons === "string" ? app.icons : "",
      id: typeof app.id === "string" ? app.id : "",
      version: typeof app.version === "string" ? app.version : "",
    },
    schema: "threenative.distribution",
    targets: targets.filter(isRecord).map(normalizeTarget),
    version: "0.1.0",
  };
  if (typeof app.privacyPolicyUrl === "string") normalized.app.privacyPolicyUrl = app.privacyPolicyUrl;
  if (typeof app.splash === "string") normalized.app.splash = app.splash;
  const signing = normalizeSigning(source.signing);
  if (signing !== undefined) normalized.signing = signing;
  return normalized;
}

function row(
  platform: DistributionPlatform,
  runtime: DistributionRuntime,
  formats: readonly DistributionFormat[],
  eligibleHosts: readonly DistributionHost[],
  requiredTools: readonly string[],
  signable: boolean,
  proofRequirements: readonly string[],
  promotion: DistributionPromotion = "planned",
  architectures: readonly DistributionArchitecture[] = architecturesFor(platform),
): IDistributionRegistryRow {
  return {
    architectures,
    eligibleHosts,
    formats,
    platform,
    promotion,
    proofRequirements,
    requiredTools,
    runtime,
    signable,
  };
}

function architecturesFor(platform: DistributionPlatform): readonly DistributionArchitecture[] {
  switch (platform) {
    case "web":
    case "windows":
    case "linux":
      return ["x86_64", "arm64"];
    case "macos":
      return ["x86_64", "arm64", "universal"];
    case "android":
    case "ios":
      return ["arm64", "simulator"];
  }
}

function mobileProof(runtimeProof: string): readonly string[] {
  return [runtimeProof, "emulator-or-simulator", "physical-device", "install", "launch", "first-frame", "touch", "local-assets", "suspend-resume", "persistence", "orientation-safe-area", "signature"];
}

function validateApp(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_APP_INVALID", path, "Distribution app metadata must be an object."));
    return;
  }
  validateFields(value, ["buildNumber", "displayName", "icons", "id", "privacyPolicyUrl", "splash", "version"], path, diagnostics);
  if (typeof value.id !== "string" || !APP_ID.test(value.id)) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_APP_ID_INVALID", `${path}/id`, "Distribution app id must be a reverse-DNS identifier such as 'com.example.game'."));
  }
  if (typeof value.displayName !== "string" || value.displayName.trim() === "") {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_DISPLAY_NAME_INVALID", `${path}/displayName`, "Distribution displayName must be non-empty."));
  }
  if (typeof value.version !== "string" || !SEMVER.test(value.version)) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_APP_VERSION_INVALID", `${path}/version`, "Distribution app version must be semantic version text."));
  }
  if (!Number.isSafeInteger(value.buildNumber) || (value.buildNumber as number) < 1) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_BUILD_NUMBER_INVALID", `${path}/buildNumber`, "Distribution buildNumber must be a positive safe integer."));
  }
  validatePath(value.icons, `${path}/icons`, diagnostics);
  if (value.splash !== undefined) validatePath(value.splash, `${path}/splash`, diagnostics);
  if (value.privacyPolicyUrl !== undefined && (typeof value.privacyPolicyUrl !== "string" || !value.privacyPolicyUrl.startsWith("https://"))) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_PRIVACY_URL_INVALID", `${path}/privacyPolicyUrl`, "Distribution privacyPolicyUrl must use HTTPS."));
  }
}

function validateTargets(
  value: unknown,
  path: string,
  diagnostics: IIrDiagnostic[],
  targetProfile: Pick<ITargetProfile, "targets"> | undefined,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_TARGETS_INVALID", path, "Distribution targets must be a non-empty array."));
    return;
  }
  const seen = new Set<string>();
  value.forEach((target, index) => {
    const targetPath = `${path}/${index}`;
    if (!isRecord(target)) {
      diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_TARGET_INVALID", targetPath, "Distribution target must be an object."));
      return;
    }
    validateFields(target, ["architecture", "capabilities", "channel", "formats", "minimumOs", "platform", "runtime"], targetPath, diagnostics);
    const platform = isLiteral(target.platform, DISTRIBUTION_PLATFORMS) ? target.platform : undefined;
    const runtime = isLiteral(target.runtime, DISTRIBUTION_RUNTIMES) ? target.runtime : undefined;
    if (platform === undefined) diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_PLATFORM_INVALID", `${targetPath}/platform`, "Distribution platform is unsupported.", DISTRIBUTION_PLATFORMS));
    if (runtime === undefined) diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_RUNTIME_INVALID", `${targetPath}/runtime`, "Distribution runtime is unsupported.", DISTRIBUTION_RUNTIMES));
    if (platform === undefined || runtime === undefined) return;
    const registry = distributionRegistryRow(platform, runtime);
    if (registry === undefined) {
      diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_RUNTIME_UNSUPPORTED", `${targetPath}/runtime`, `Distribution runtime '${runtime}' is not supported on '${platform}'.`));
      return;
    }
    const requiredProfile = platform === "web" ? "web" : "desktop";
    if (targetProfile !== undefined && !targetProfile.targets.includes(requiredProfile)) {
      diagnostics.push(allowedDiagnostic(
        "TN_IR_DISTRIBUTION_TARGET_PROFILE_INCOMPATIBLE",
        `${targetPath}/platform`,
        `Distribution target '${platform}/${runtime}' requires the existing '${requiredProfile}' target profile.`,
        ["web", "desktop"],
      ));
    }
    const key = `${platform}/${runtime}`;
    if (seen.has(key)) diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_TARGET_DUPLICATE", targetPath, `Distribution target '${key}' is declared more than once.`));
    seen.add(key);
    if (!Array.isArray(target.formats) || target.formats.length === 0) {
      diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_FORMATS_INVALID", `${targetPath}/formats`, `Distribution target '${key}' must declare at least one format.`, registry.formats));
    } else {
      target.formats.forEach((format, formatIndex) => {
        if (typeof format !== "string" || !registry.formats.includes(format as DistributionFormat)) {
          diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_FORMAT_UNSUPPORTED", `${targetPath}/formats/${formatIndex}`, `Distribution combination '${platform}/${runtime}/${String(format)}' is unsupported.`, registry.formats));
        }
      });
    }
    if (target.architecture !== undefined && (!isLiteral(target.architecture, DISTRIBUTION_ARCHITECTURES) || !registry.architectures.includes(target.architecture))) {
      diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_ARCHITECTURE_UNSUPPORTED", `${targetPath}/architecture`, `Distribution architecture '${String(target.architecture)}' is unsupported for '${key}'.`, registry.architectures));
    }
    if (target.channel !== undefined && !isLiteral(target.channel, DISTRIBUTION_CHANNELS)) {
      diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_CHANNEL_INVALID", `${targetPath}/channel`, "Distribution channel is unsupported.", DISTRIBUTION_CHANNELS));
    }
    if (target.capabilities !== undefined) validateCapabilities(target.capabilities, `${targetPath}/capabilities`, diagnostics);
    if (target.minimumOs !== undefined && (typeof target.minimumOs !== "string" || target.minimumOs.trim() === "")) {
      diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_MINIMUM_OS_INVALID", `${targetPath}/minimumOs`, "Distribution minimumOs must be non-empty text."));
    }
  });
}

function validateCapabilities(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_CAPABILITIES_INVALID", path, "Distribution capabilities must be an array.", DISTRIBUTION_CAPABILITIES));
    return;
  }
  value.forEach((capability, index) => {
    if (!isLiteral(capability, DISTRIBUTION_CAPABILITIES)) diagnostics.push(allowedDiagnostic("TN_IR_DISTRIBUTION_CAPABILITY_INVALID", `${path}/${index}`, `Distribution capability '${String(capability)}' is unsupported.`, DISTRIBUTION_CAPABILITIES));
  });
}

function validateSigning(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_SIGNING_INVALID", path, "Distribution signing metadata must be an object of credential references."));
    return;
  }
  for (const [provider, providerValue] of Object.entries(value)) {
    const providerPath = `${path}/${provider}`;
    if (!(["android", "apple", "windows"] as const).includes(provider as "android" | "apple" | "windows")) {
      diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_SIGNING_PROVIDER_UNSUPPORTED", providerPath, `Distribution signing provider '${provider}' is unsupported.`));
      continue;
    }
    if (!isRecord(providerValue)) {
      diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_SIGNING_INVALID", providerPath, "Distribution signing provider must be an object."));
      continue;
    }
    validateFields(providerValue, ["credentialRef"], providerPath, diagnostics, "TN_IR_DISTRIBUTION_SIGNING_FIELD_UNSUPPORTED");
    if (typeof providerValue.credentialRef !== "string" || !CREDENTIAL_REF.test(providerValue.credentialRef)) {
      diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_CREDENTIAL_REF_INVALID", `${providerPath}/credentialRef`, "Distribution credentialRef must be provider-qualified, for example 'ci:android-upload' or 'keychain:threenative-apple'."));
    }
  }
}

function validateFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  diagnostics: IIrDiagnostic[],
  unsupportedCode = "TN_IR_DISTRIBUTION_FIELD_UNSUPPORTED",
): void {
  for (const field of Object.keys(value)) {
    if (allowed.includes(field)) continue;
    const secret = SECRET_FIELD.test(field);
    diagnostics.push(diagnostic(
      secret ? "TN_IR_DISTRIBUTION_SIGNING_SECRET_FORBIDDEN" : unsupportedCode,
      `${path}/${field}`,
      secret
        ? "Durable distribution source must not contain secret-shaped fields; use an opaque credentialRef."
        : `Distribution field '${field}' is unsupported.`,
    ));
  }
}

function validatePath(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || !validateBundleRelativePath(value).ok) {
    diagnostics.push(diagnostic("TN_IR_DISTRIBUTION_PATH_UNSAFE", path, "Distribution presentation assets must use a safe project-relative POSIX path."));
  }
}

function normalizeTarget(target: Record<string, unknown>): IDistributionTarget {
  const formats = Array.isArray(target.formats) ? target.formats.filter((value): value is DistributionFormat => isLiteral(value, DISTRIBUTION_FORMATS)) : [];
  const normalized: IDistributionTarget = {
    formats: orderedUnique(formats, DISTRIBUTION_FORMATS),
    platform: isLiteral(target.platform, DISTRIBUTION_PLATFORMS) ? target.platform : "web",
    runtime: isLiteral(target.runtime, DISTRIBUTION_RUNTIMES) ? target.runtime : "web",
  };
  if (isLiteral(target.architecture, DISTRIBUTION_ARCHITECTURES)) normalized.architecture = target.architecture;
  if (Array.isArray(target.capabilities)) normalized.capabilities = orderedUnique(target.capabilities.filter((value): value is DistributionCapability => isLiteral(value, DISTRIBUTION_CAPABILITIES)), DISTRIBUTION_CAPABILITIES);
  if (isLiteral(target.channel, DISTRIBUTION_CHANNELS)) normalized.channel = target.channel;
  if (typeof target.minimumOs === "string") normalized.minimumOs = target.minimumOs;
  return normalized;
}

function normalizeSigning(value: unknown): IDistributionSource["signing"] | undefined {
  if (!isRecord(value)) return undefined;
  const signing: NonNullable<IDistributionSource["signing"]> = {};
  for (const provider of ["android", "apple", "windows"] as const) {
    const entry = value[provider];
    if (isRecord(entry) && typeof entry.credentialRef === "string") signing[provider] = { credentialRef: entry.credentialRef };
  }
  return Object.keys(signing).length === 0 ? undefined : signing;
}

function orderedUnique<T extends string>(values: readonly T[], order: readonly T[]): T[] {
  const included = new Set(values);
  return order.filter((value) => included.has(value));
}

function isLiteral<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnostic(code: string, path: string, message: string): IIrDiagnostic {
  return { code, message, path, severity: "error" };
}

function allowedDiagnostic(code: string, path: string, message: string, allowed: readonly string[]): IIrDiagnostic {
  return {
    ...diagnostic(code, path, message),
    fix: { allowed, instruction: `Choose one of: ${allowed.join(", ")}.` },
  };
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
