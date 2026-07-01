import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface TemplateDefinition {
  canonical: string;
  default?: boolean;
  sourceDir: string;
}

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [
  { canonical: "structured-source-starter", sourceDir: "structured-source-starter", default: true },
] as const;

export function resolveTemplate(requested?: string): {
  definition: TemplateDefinition;
} | null {
  const template = requested ?? TEMPLATE_REGISTRY.find((entry) => entry.default)?.canonical ?? "structured-source-starter";
  const direct = TEMPLATE_REGISTRY.find((entry) => entry.canonical === template);
  return direct === undefined ? null : { definition: direct };
}

export function listCanonicalTemplates(): string[] {
  return TEMPLATE_REGISTRY.map((entry) => entry.canonical);
}

export function formatTemplateUsage(): string {
  const canonical = listCanonicalTemplates().join("|");
  return `--template ${canonical}`;
}

export const templatesRootFromModule = (importMetaUrl: string): { packaged: string; source: string } => ({
  packaged: fileURLToPath(new URL("../template-files/", importMetaUrl)),
  source: fileURLToPath(new URL("../../../../templates/", importMetaUrl)),
});

export function resolveTemplateSourcePath(templatesRoot: string, definition: TemplateDefinition): string {
  return resolve(templatesRoot, definition.sourceDir);
}
