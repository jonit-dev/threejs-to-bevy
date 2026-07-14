import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DISTRIBUTION_CAPABILITIES,
  normalizeDistribution,
  type DistributionCapability,
  type DistributionPlatform,
  type IDistributionSource,
} from "@threenative/ir";
import { PNG } from "pngjs";

export interface ITauriShellReport {
  cacheKey: string;
  capabilityPolicy: Array<{ capability: DistributionCapability; permissions: string[]; surface: TauriCapabilitySurface }>;
  capabilities: Array<{ identifier: string; permissions: string[]; windows: string[] }>;
  declaredCapabilities: DistributionCapability[];
  files: string[];
  frontendDist: "web";
  schema: "threenative.tauri-shell-report";
  shellPath: string;
  tauri: { build: "2.6.3"; cliRequired: "2.11.4"; runtime: "2.11.5" };
  version: "0.1.0";
}

type TauriCapabilitySurface = "browser-gamepad" | "browser-media" | "browser-network" | "browser-storage" | "browser-vibration";

export const TAURI_CAPABILITY_POLICY = {
  camera: { permissions: [], surface: "browser-media" },
  gamepad: { permissions: [], surface: "browser-gamepad" },
  microphone: { permissions: [], surface: "browser-media" },
  network: { permissions: [], surface: "browser-network" },
  storage: { permissions: [], surface: "browser-storage" },
  vibration: { permissions: [], surface: "browser-vibration" },
} as const satisfies Record<DistributionCapability, { permissions: readonly string[]; surface: TauriCapabilitySurface }>;

export const TAURI_CLI_REQUIRED_VERSION = "2.11.4" as const;

export async function generateTauriShell(options: {
  distribution: IDistributionSource;
  platform: Exclude<DistributionPlatform, "web">;
  projectPath: string;
  webArtifactPath: string;
}): Promise<ITauriShellReport> {
  const distribution = normalizeDistribution(options.distribution);
  const target = distribution.targets.find(({ platform, runtime }) => platform === options.platform && runtime === "webview");
  if (target === undefined) throw new Error(`TN_TAURI_TARGET_UNDECLARED: Distribution target '${options.platform}/webview' is not declared.`);
  const declaredCapabilities = [...(target.capabilities ?? [])].sort();
  const capabilityPolicy = declaredCapabilities.map((capability) => ({
    capability,
    permissions: [...TAURI_CAPABILITY_POLICY[capability].permissions],
    surface: TAURI_CAPABILITY_POLICY[capability].surface,
  }));
  const templatePath = fileURLToPath(new URL("../../templates/tauri", import.meta.url));
  const webPath = resolve(options.webArtifactPath);
  const sourceIconBytes = await readFile(resolve(options.projectPath, distribution.app.icons));
  const cacheHash = createHash("sha256").update(JSON.stringify(distribution)).update("\0platform\0").update(options.platform).update("\0icon\0").update(sourceIconBytes);
  await updateDirectoryHash(cacheHash, templatePath);
  await updateDirectoryHash(cacheHash, webPath);
  const cacheKey = cacheHash.digest("hex");
  const shellPath = resolve(options.projectPath, ".threenative/cache/distribution", cacheKey, "tauri");
  await rm(shellPath, { force: true, recursive: true });
  await mkdir(shellPath, { recursive: true });
  await cp(templatePath, shellPath, { force: true, recursive: true });
  await writeFile(resolve(shellPath, "build.rs"), "fn main() { tauri_build::build(); }\n");
  await writeFile(resolve(shellPath, "src/main.rs"), "fn main() { threenative_generated_shell::run(); }\n");
  await mkdir(resolve(shellPath, "icons"), { recursive: true });
  const sourceIcon = PNG.sync.read(sourceIconBytes);
  const iconSize = Math.min(sourceIcon.width, sourceIcon.height);
  const squareIcon = new PNG({ height: iconSize, width: iconSize });
  PNG.bitblt(
    sourceIcon,
    squareIcon,
    Math.floor((sourceIcon.width - iconSize) / 2),
    Math.floor((sourceIcon.height - iconSize) / 2),
    iconSize,
    iconSize,
    0,
    0,
  );
  await writeFile(resolve(shellPath, "icons/icon.png"), PNG.sync.write(squareIcon, { colorType: 6 }));
  await cp(webPath, resolve(shellPath, "web"), { force: true, recursive: true });

  const capability = {
    identifier: "main",
    permissions: ["core:default", ...new Set(capabilityPolicy.flatMap(({ permissions }) => permissions))],
    windows: ["main"],
  };
  const config = {
    $schema: "https://schema.tauri.app/config/2",
    app: {
      security: { capabilities: [capability] },
      windows: [{ label: "main", title: distribution.app.displayName }],
    },
    build: { frontendDist: "web" },
    bundle: { active: false, icon: ["icons/icon.png"] },
    identifier: distribution.app.id,
    productName: distribution.app.displayName,
    version: distribution.app.version,
  };
  await writeFile(resolve(shellPath, "tauri.conf.json"), `${JSON.stringify(config, null, 2)}\n`);
  const report: ITauriShellReport = {
    cacheKey,
    capabilityPolicy,
    capabilities: [capability],
    declaredCapabilities,
    files: await relativeFiles(shellPath),
    frontendDist: "web",
    schema: "threenative.tauri-shell-report",
    shellPath,
    tauri: { build: "2.6.3", cliRequired: TAURI_CLI_REQUIRED_VERSION, runtime: "2.11.5" },
    version: "0.1.0",
  };
  await writeFile(resolve(shellPath, "shell-report.json"), `${JSON.stringify({ ...report, shellPath: "." }, null, 2)}\n`);
  return report;
}

export function assertTauriCapabilityPolicyComplete(): void {
  const policyCapabilities = Object.keys(TAURI_CAPABILITY_POLICY).sort();
  const registryCapabilities = [...DISTRIBUTION_CAPABILITIES].sort();
  if (JSON.stringify(policyCapabilities) !== JSON.stringify(registryCapabilities)) {
    throw new Error("TN_TAURI_CAPABILITY_POLICY_DRIFT: Tauri capability policy must cover the owning IR capability registry.");
  }
}

async function updateDirectoryHash(hash: ReturnType<typeof createHash>, root: string): Promise<void> {
  for (const path of await relativeFiles(root)) {
    hash.update("\0file\0").update(path).update("\0").update(await readFile(resolve(root, path)));
  }
}

async function relativeFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const rows = await Promise.all(entries.map(async (entry) => {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? relativeFiles(root, path) : [path];
  }));
  return rows.flat().sort();
}

export async function readGeneratedTauriConfig(shellPath: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(shellPath, "tauri.conf.json"), "utf8"));
}
