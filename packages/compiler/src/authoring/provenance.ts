import { relative } from "node:path";

import type { AuthoringDeclarationKind, IAuthoringGraph, IAuthoringProvenance } from "./graph.js";

export const AUTHORING_PROVENANCE_FILE = "authoring.provenance.json" as const;

export interface IAuthoringProvenanceDocument {
  declarations: IAuthoringGraph["declarations"];
  diagnostics: IAuthoringGraph["diagnostics"];
  entryPath: string;
  modules: IAuthoringGraph["modules"];
  schema: "threenative.authoring-provenance";
  version: "0.1.0";
}

export function relativeModulePath(projectRoot: string, filePath: string): string {
  return normalizePath(relative(projectRoot, filePath));
}

export function compatibilityProvenance(
  projectRoot: string,
  entryPath: string,
  kind: AuthoringDeclarationKind,
  declarationId: string,
  ownerScene?: string,
): IAuthoringProvenance {
  return {
    declarationId,
    kind,
    ...(ownerScene === undefined ? {} : { ownerScene }),
    source: { modulePath: relativeModulePath(projectRoot, entryPath) },
  };
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function authoringProvenanceDocument(graph: IAuthoringGraph): IAuthoringProvenanceDocument {
  return {
    declarations: graph.declarations,
    diagnostics: graph.diagnostics,
    entryPath: graph.entryPath,
    modules: graph.modules,
    schema: "threenative.authoring-provenance",
    version: "0.1.0",
  };
}
