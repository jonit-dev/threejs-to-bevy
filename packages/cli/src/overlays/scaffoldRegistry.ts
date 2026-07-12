import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type OverlayStyle = "tailwind" | "vanilla";

export interface IOverlayScaffoldDescriptor {
  default?: boolean;
  dependencies: Readonly<Record<string, string>>;
  devDependencies: Readonly<Record<string, string>>;
  entry: string;
  presetFiles: readonly string[];
  sharedFiles: readonly string[];
  outputDirectory: string;
  scriptCommandTemplate: string;
  scriptNameTemplate: string;
  sourceDirectory: string;
  style: OverlayStyle;
  supportedFlags: readonly string[];
  templateDirectory: string;
}

export const OVERLAY_CLIENT_VERSION = "^0.1.11";
const reactDependencies = { "@threenative/overlay-client": OVERLAY_CLIENT_VERSION, react: "^19.2.7", "react-dom": "^19.2.7" } as const;
const reactDevDependencies = {
  "@types/react": "^19.2.17",
  "@types/react-dom": "^19.2.3",
  typescript: "^5.9.3",
  vite: "^7.3.5",
} as const;
const presetFiles = ["index.html", "src/App.tsx", "src/styles.css", "tsconfig.json", "vite.config.ts"] as const;
const sharedFiles = ["src/client.ts", "src/main.tsx"] as const;

export const OVERLAY_SCAFFOLD_REGISTRY: readonly IOverlayScaffoldDescriptor[] = [
  {
    default: true,
    dependencies: reactDependencies,
    devDependencies: { ...reactDevDependencies, "@tailwindcss/vite": "^4.1.14", tailwindcss: "^4.1.14" },
    entry: "dist/index.html",
    presetFiles,
    sharedFiles,
    outputDirectory: "dist",
    scriptCommandTemplate: "vite build {sourceDirectory} --config {sourceDirectory}/vite.config.ts",
    scriptNameTemplate: "build:overlay:{name}",
    sourceDirectory: "overlay",
    style: "tailwind",
    supportedFlags: ["--style", "--project", "--json"],
    templateDirectory: "tailwind",
  },
  {
    dependencies: reactDependencies,
    devDependencies: reactDevDependencies,
    entry: "dist/index.html",
    presetFiles,
    sharedFiles,
    outputDirectory: "dist",
    scriptCommandTemplate: "vite build {sourceDirectory} --config {sourceDirectory}/vite.config.ts",
    scriptNameTemplate: "build:overlay:{name}",
    sourceDirectory: "overlay",
    style: "vanilla",
    supportedFlags: ["--style", "--project", "--json"],
    templateDirectory: "vanilla",
  },
] as const;

export function listOverlayStyles(): OverlayStyle[] {
  return OVERLAY_SCAFFOLD_REGISTRY.map((descriptor) => descriptor.style);
}

export function defaultOverlayStyle(): OverlayStyle {
  const defaults = OVERLAY_SCAFFOLD_REGISTRY.filter((descriptor) => descriptor.default === true);
  if (defaults.length !== 1) throw new Error("TN_OVERLAY_SCAFFOLD_REGISTRY_INVALID: exactly one overlay style must be the default.");
  return defaults[0]!.style;
}

export function resolveOverlayScaffold(style?: string): IOverlayScaffoldDescriptor | undefined {
  const requested = style ?? defaultOverlayStyle();
  return OVERLAY_SCAFFOLD_REGISTRY.find((descriptor) => descriptor.style === requested);
}

export function formatOverlayStyleUsage(): string {
  return `--style ${listOverlayStyles().join("|")} (default: ${defaultOverlayStyle()})`;
}

export function formatOverlayAddUsage(): string {
  const descriptor = resolveOverlayScaffold()!;
  const flags = descriptor.supportedFlags.map((flag) => flag === "--style" ? `[${formatOverlayStyleUsage()}]` : flag === "--project" ? "[--project <path>]" : `[${flag}]`).join(" ");
  return `tn overlay add <name> ${flags}`;
}

export function supportedOverlayFlags(): readonly string[] {
  const descriptor = resolveOverlayScaffold()!;
  const signature = descriptor.supportedFlags.join("\0");
  if (OVERLAY_SCAFFOLD_REGISTRY.some((item) => item.supportedFlags.join("\0") !== signature)) throw new Error("TN_OVERLAY_SCAFFOLD_REGISTRY_INVALID: overlay presets must expose the same command flags.");
  return descriptor.supportedFlags;
}

export function overlayBuildScript(descriptor: IOverlayScaffoldDescriptor, name: string, sourceDirectory: string): { command: string; name: string } {
  return {
    command: descriptor.scriptCommandTemplate.replaceAll("{sourceDirectory}", sourceDirectory).replaceAll("{name}", name),
    name: descriptor.scriptNameTemplate.replaceAll("{sourceDirectory}", sourceDirectory).replaceAll("{name}", name),
  };
}

export function overlayTemplatesRoot(importMetaUrl: string): { packaged: string; source: string } {
  return {
    packaged: fileURLToPath(new URL("../overlay-templates/", importMetaUrl)),
    source: fileURLToPath(new URL("../overlays/templates/", importMetaUrl)),
  };
}

export function resolveOverlayTemplateRoot(importMetaUrl: string, descriptor: IOverlayScaffoldDescriptor): string {
  const roots = overlayTemplatesRoot(importMetaUrl);
  const root = importMetaUrl.includes("/dist/") ? roots.packaged : roots.source;
  return resolve(root, descriptor.templateDirectory);
}

export function resolveOverlayTemplateFiles(importMetaUrl: string, descriptor: IOverlayScaffoldDescriptor): Array<{ destination: string; source: string }> {
  const presetRoot = resolveOverlayTemplateRoot(importMetaUrl, descriptor);
  const roots = overlayTemplatesRoot(importMetaUrl);
  const templatesRoot = importMetaUrl.includes("/dist/") ? roots.packaged : roots.source;
  return [
    ...descriptor.sharedFiles.map((path) => ({ destination: path, source: resolve(templatesRoot, "shared", path) })),
    ...descriptor.presetFiles.map((path) => ({ destination: path, source: resolve(presetRoot, path) })),
  ];
}
