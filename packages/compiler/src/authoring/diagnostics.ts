import type { ICompilerDiagnostic } from "../diagnostics.js";
import type { IAuthoringDeclarationNode } from "./graph.js";

export function diagnoseAuthoringConflicts(declarations: ReadonlyArray<IAuthoringDeclarationNode>): ICompilerDiagnostic[] {
  const diagnostics: ICompilerDiagnostic[] = [];
  const byKindAndId = new Map<string, IAuthoringDeclarationNode[]>();

  for (const declaration of declarations) {
    const key = `${declaration.kind}:${declaration.id}`;
    const existing = byKindAndId.get(key);
    if (existing === undefined) {
      byKindAndId.set(key, [declaration]);
    } else {
      existing.push(declaration);
    }
  }

  for (const duplicates of [...byKindAndId.values()].filter((items) => items.length > 1)) {
    const [first] = duplicates;
    if (first === undefined) {
      continue;
    }
    diagnostics.push({
      code: duplicateCode(first.kind),
      file: first.provenance.source.modulePath,
      limit: duplicates.map((declaration) => declaration.provenance.source.modulePath).sort(),
      message: `Duplicate ${first.kind} declaration '${first.id}' appears in authoring source.`,
      path: `authoring/${first.kind}/${first.id}`,
      severity: "error",
      suggestion: `Give each ${first.kind} declaration a stable unique ID before emitting runtime IR.`,
      target: first.id,
    });
  }

  return diagnostics.sort((left, right) => (left.path ?? "").localeCompare(right.path ?? "") || left.code.localeCompare(right.code));
}

function duplicateCode(kind: string): string {
  return `TN_AUTHORING_DUPLICATE_${kind.toUpperCase()}_ID`;
}
