import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface TemplateDefinition {
  canonical: string;
  default?: boolean;
  legacyAliases: readonly string[];
  sourceDir: string;
}

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [
  { canonical: "starter", sourceDir: "v1", legacyAliases: ["v1"], default: true },
  { canonical: "arena", sourceDir: "v2-arena", legacyAliases: ["v2-arena"] },
  { canonical: "environment", sourceDir: "v3-environment", legacyAliases: ["v3-environment"] },
  { canonical: "scripting", sourceDir: "v4-scripting", legacyAliases: ["v4-scripting"] },
  { canonical: "game-starter", sourceDir: "v5-game-starter", legacyAliases: ["v5-game-starter"] },
  { canonical: "starter-functional", sourceDir: "starter-functional", legacyAliases: ["v7-functional"] },
  { canonical: "structured-source-starter", sourceDir: "structured-source-starter", legacyAliases: [] },
] as const;

export function resolveTemplate(requested?: string): {
  definition: TemplateDefinition;
  legacyAliasUsed: boolean;
} | null {
  const template = requested ?? TEMPLATE_REGISTRY.find((entry) => entry.default)?.canonical ?? "starter";
  const direct = TEMPLATE_REGISTRY.find((entry) => entry.canonical === template);
  if (direct) {
    return { definition: direct, legacyAliasUsed: false };
  }
  const alias = TEMPLATE_REGISTRY.find((entry) => entry.legacyAliases.includes(template));
  if (!alias) {
    return null;
  }
  return { definition: alias, legacyAliasUsed: true };
}

export function listCanonicalTemplates(): string[] {
  return TEMPLATE_REGISTRY.map((entry) => entry.canonical);
}

export function listLegacyTemplateAliases(): string[] {
  return TEMPLATE_REGISTRY.flatMap((entry) => [...entry.legacyAliases]);
}

export function formatTemplateUsage(): string {
  const canonical = listCanonicalTemplates().join("|");
  const legacy = listLegacyTemplateAliases().join("|");
  return `--template ${canonical} (legacy aliases: ${legacy})`;
}

export function templateDeprecationMessage(legacyAlias: string, canonical: string): string {
  return `Template '${legacyAlias}' is a legacy milestone alias. Use '--template ${canonical}' for new projects.`;
}

export const templatesRootFromModule = (importMetaUrl: string): { packaged: string; source: string } => ({
  packaged: fileURLToPath(new URL("../template-files/", importMetaUrl)),
  source: fileURLToPath(new URL("../../../../templates/", importMetaUrl)),
});

export function resolveTemplateSourcePath(templatesRoot: string, definition: TemplateDefinition): string {
  return resolve(templatesRoot, definition.sourceDir);
}
