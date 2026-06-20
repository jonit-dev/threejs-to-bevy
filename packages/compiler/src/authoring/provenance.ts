import { relative } from "node:path";

import type { AuthoringDeclarationKind, IAuthoringProvenance } from "./graph.js";

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
