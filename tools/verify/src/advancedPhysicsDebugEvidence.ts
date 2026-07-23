import { PHYSICS_DEBUG_CATEGORIES, PHYSICS_DEBUG_EVIDENCE_OWNERS, type PhysicsDebugCategory, type PhysicsDebugPrimitiveKind } from "@threenative/ir";

export interface AdvancedPhysicsDebugEvidence {
  category: PhysicsDebugCategory;
  id: string;
  kind: PhysicsDebugPrimitiveKind;
}

export interface AdvancedPhysicsDebugDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error";
  suggestedFix: string;
}

export function expectedPhysicsDebugCategories(owner: string): PhysicsDebugCategory[] {
  return PHYSICS_DEBUG_CATEGORIES.filter((category) => PHYSICS_DEBUG_EVIDENCE_OWNERS[category] === owner);
}

export function validateAdvancedPhysicsDebugEvidence(
  owner: string,
  web: readonly AdvancedPhysicsDebugEvidence[],
  native: readonly AdvancedPhysicsDebugEvidence[],
): AdvancedPhysicsDebugDiagnostic[] {
  const diagnostics: AdvancedPhysicsDebugDiagnostic[] = [];
  const expected = expectedPhysicsDebugCategories(owner);
  for (const [runtime, evidence] of [["web", web], ["native", native]] as const) {
    const categories = new Set(evidence.map((entry) => entry.category));
    for (const category of expected) {
      if (!categories.has(category)) diagnostics.push({
        code: "TN_VERIFY_PHYSICS_DEBUG_CATEGORY_MISSING",
        message: `${runtime} debug evidence is missing registry-owned '${category}' coverage for ${owner}.`,
        path: `${runtime}/debugEvidence/${category}`,
        severity: "error",
        suggestedFix: "Capture the normalized runtime debug snapshot from the focused fixture observation.",
      });
    }
  }
  const owned = new Set(expected);
  if (stable(web.filter((entry) => owned.has(entry.category))) !== stable(native.filter((entry) => owned.has(entry.category)))) diagnostics.push({
    code: "TN_VERIFY_PHYSICS_DEBUG_EVIDENCE_MISMATCH",
    message: `Web/native debug category, ID, and primitive-kind evidence differs for ${owner}.`,
    path: "paired/debugEvidence",
    severity: "error",
    suggestedFix: "Normalize debug primitive identity and kind at the runtime snapshot boundary.",
  });
  return diagnostics;
}

function stable(value: readonly AdvancedPhysicsDebugEvidence[]): string {
  return JSON.stringify([...value].map(({ category, id, kind }) => ({ category, id, kind })).sort((left, right) =>
    left.category.localeCompare(right.category) || left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind)));
}
