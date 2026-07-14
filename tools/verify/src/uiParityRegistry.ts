import { UI_NODE_KINDS, type UiNodeKind } from "@threenative/ir";

export const UI_EVIDENCE_TIERS = ["rendered", "behavioral", "accessibility-metadata", "platform-assistive", "unsupported"] as const;
export type UiEvidenceTier = (typeof UI_EVIDENCE_TIERS)[number];
export type UiParityClaim = "partial" | "promoted" | "unsupported";
export type UiEvidenceKind = "accessibility-snapshot" | "behavior-report" | "diagnostic" | "platform-transcript" | "rendered-screenshot" | "trace";

const platformDiagnosticsArtifact = "tools/verify/artifacts/feature-parity-ui-native/platform-diagnostics.json";
const nativeTraceArtifact = "tools/verify/artifacts/feature-parity-ui-native/native-trace.json";

export interface UiParityEvidence {
  adapter: "native" | "shared" | "web";
  artifact?: string;
  kind: UiEvidenceKind;
  platform?: string;
}

export interface UiParityRow {
  capability?: string;
  claim: UiParityClaim;
  diagnosticCodes?: readonly string[];
  evidence: readonly UiParityEvidence[];
  fixtureId?: string;
  id: string;
  nodeKinds?: readonly UiNodeKind[];
  requiredTier: UiEvidenceTier;
}

const viewportArtifacts = (adapter: "native" | "web"): UiParityEvidence[] => ["desktop", "mobile"].map((viewport) => ({
  adapter,
  artifact: `tools/verify/artifacts/feature-parity-ui-native/viewports/${viewport}/${adapter}.png`,
  kind: "rendered-screenshot",
}));

const pairedRendered = [...viewportArtifacts("web"), ...viewportArtifacts("native")] as const;
const pairedBehavior = [
  { adapter: "web", artifact: "tools/verify/artifacts/feature-parity-ui-native/behavior/web.json", kind: "behavior-report" },
  { adapter: "native", artifact: "tools/verify/artifacts/feature-parity-ui-native/behavior/native.json", kind: "behavior-report" },
] as const;
const pairedAccessibility = [
  { adapter: "web", artifact: "tools/verify/artifacts/feature-parity-ui-native/accessibility/web.json", kind: "accessibility-snapshot" },
  { adapter: "native", artifact: "tools/verify/artifacts/feature-parity-ui-native/accessibility/native.json", kind: "accessibility-snapshot" },
] as const;

export const UI_PARITY_ROWS: readonly UiParityRow[] = [
  { claim: "promoted", evidence: pairedRendered, id: "node.bar", nodeKinds: ["bar"], requiredTier: "rendered" },
  { claim: "promoted", evidence: pairedBehavior, id: "node.button", nodeKinds: ["button"], requiredTier: "behavioral" },
  { claim: "promoted", evidence: pairedRendered, id: "node.column", nodeKinds: ["column"], requiredTier: "rendered" },
  { claim: "partial", evidence: [{ adapter: "shared", kind: "trace" }], id: "node.component", nodeKinds: ["component"], requiredTier: "behavioral" },
  { claim: "partial", evidence: [{ adapter: "web", kind: "behavior-report" }, { adapter: "native", kind: "trace" }], id: "node.context-menu", nodeKinds: ["contextMenu"], requiredTier: "behavioral" },
  { claim: "promoted", evidence: pairedRendered, id: "node.image", nodeKinds: ["image"], requiredTier: "rendered" },
  { claim: "partial", evidence: [{ adapter: "web", kind: "behavior-report" }, { adapter: "native", kind: "behavior-report" }], id: "node.minimap", nodeKinds: ["minimap"], requiredTier: "rendered" },
  { claim: "promoted", evidence: pairedRendered, id: "node.row", nodeKinds: ["row"], requiredTier: "rendered" },
  { claim: "partial", evidence: [{ adapter: "web", kind: "behavior-report" }, { adapter: "native", kind: "trace" }], id: "node.scrollbar", nodeKinds: ["scrollbar"], requiredTier: "behavioral" },
  { claim: "promoted", evidence: pairedBehavior, id: "node.slider", nodeKinds: ["slider"], requiredTier: "behavioral" },
  { claim: "promoted", evidence: pairedRendered, id: "node.stack", nodeKinds: ["stack"], requiredTier: "rendered" },
  { claim: "promoted", evidence: pairedRendered, id: "node.text", nodeKinds: ["text"], requiredTier: "rendered" },
  { claim: "promoted", evidence: pairedBehavior, id: "node.text-input", nodeKinds: ["textInput"], requiredTier: "behavioral" },
  { capability: "ui:touch-control", claim: "promoted", evidence: pairedBehavior, fixtureId: "input-ui-polish", id: "node.touch-control", nodeKinds: ["touchControl"], requiredTier: "behavioral" },
  { claim: "promoted", evidence: pairedRendered, id: "layout.responsive", requiredTier: "rendered" },
  { capability: "ui:disabled-runtime-update", claim: "promoted", evidence: pairedBehavior, fixtureId: "input-ui-polish", id: "state.disabled-value", requiredTier: "behavioral" },
  { capability: "ui:focus-navigation", claim: "promoted", evidence: pairedBehavior, fixtureId: "input-ui-polish", id: "focus.sequential-explicit", requiredTier: "behavioral" },
  {
    claim: "partial",
    diagnosticCodes: ["TN_BEVY_UI_NESTED_SCROLL_PARTIAL", "TN_BEVY_UI_HORIZONTAL_SCROLL_PARTIAL"],
    evidence: [{ adapter: "web", kind: "behavior-report" }, { adapter: "native", artifact: platformDiagnosticsArtifact, kind: "diagnostic" }],
    id: "scroll.nested-axis",
    requiredTier: "behavioral",
  },
  { claim: "partial", evidence: [{ adapter: "web", kind: "behavior-report" }, { adapter: "native", kind: "trace" }], id: "focus.spatial-fallback", requiredTier: "behavioral" },
  { claim: "promoted", evidence: pairedAccessibility, id: "accessibility.role-name-value-state", requiredTier: "accessibility-metadata" },
  { claim: "partial", evidence: pairedAccessibility, id: "accessibility.focus-narration", requiredTier: "platform-assistive" },
  { claim: "partial", evidence: pairedAccessibility, id: "accessibility.screen-reader", requiredTier: "platform-assistive" },
  { claim: "unsupported", diagnosticCodes: ["TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY"], evidence: [{ adapter: "native", artifact: platformDiagnosticsArtifact, kind: "diagnostic" }], id: "platform.dpi-scaling", requiredTier: "unsupported" },
  { claim: "unsupported", diagnosticCodes: ["TN_CATALOG_UI_IME_TARGET_UNSUPPORTED"], evidence: [{ adapter: "shared", artifact: platformDiagnosticsArtifact, kind: "diagnostic" }], id: "platform.ime", requiredTier: "unsupported" },
  { claim: "unsupported", diagnosticCodes: ["TN_IR_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED", "TN_INPUT_UI_VIRTUAL_KEYBOARD_DIAGNOSTIC_ONLY"], evidence: [{ adapter: "shared", artifact: platformDiagnosticsArtifact, kind: "diagnostic" }], id: "platform.virtual-keyboard", requiredTier: "unsupported" },
  { claim: "partial", evidence: [{ adapter: "native", artifact: nativeTraceArtifact, kind: "trace" }], id: "layout.world-attachment", requiredTier: "rendered" },
  { claim: "partial", evidence: [{ adapter: "native", artifact: nativeTraceArtifact, kind: "trace" }], id: "style.native-gradient-shadow", requiredTier: "rendered" },
] as const;

export const UI_PARITY_SUPPORT_ARTIFACTS = [
  "tools/verify/artifacts/feature-parity-ui-native/viewports/desktop/contact-sheet.png",
  "tools/verify/artifacts/feature-parity-ui-native/viewports/desktop/diff.png",
  "tools/verify/artifacts/feature-parity-ui-native/viewports/mobile/contact-sheet.png",
  "tools/verify/artifacts/feature-parity-ui-native/viewports/mobile/diff.png",
  "tools/verify/artifacts/feature-parity-ui-native/viewport-report.json",
  "tools/verify/artifacts/input-ui-polish/verification-report.json",
] as const;

export interface UiParityRegistryDiagnostic {
  code: string;
  message: string;
  path: string;
}

export function validateUiParityRegistry(rows: readonly UiParityRow[] = UI_PARITY_ROWS, nodeKinds: readonly string[] = UI_NODE_KINDS): UiParityRegistryDiagnostic[] {
  const diagnostics: UiParityRegistryDiagnostic[] = [];
  const ids = new Set<string>();
  const dispositions = new Map<string, string[]>();
  for (const [index, row] of rows.entries()) {
    const path = `rows/${index}`;
    if (ids.has(row.id)) diagnostics.push({ code: "TN_VERIFY_UI_PARITY_ID_DUPLICATE", message: `UI parity row '${row.id}' is duplicated.`, path: `${path}/id` });
    ids.add(row.id);
    if (!(UI_EVIDENCE_TIERS as readonly string[]).includes(row.requiredTier)) diagnostics.push({ code: "TN_VERIFY_UI_PARITY_TIER_MISSING", message: `UI parity row '${row.id}' must declare an evidence tier.`, path: `${path}/requiredTier` });
    for (const kind of row.nodeKinds ?? []) dispositions.set(kind, [...(dispositions.get(kind) ?? []), row.id]);
    if (row.claim === "unsupported" && (row.requiredTier !== "unsupported" || (row.diagnosticCodes?.length ?? 0) === 0)) diagnostics.push({ code: "TN_VERIFY_UI_PARITY_UNSUPPORTED_DIAGNOSTIC_MISSING", message: `Unsupported UI parity row '${row.id}' must own an actionable diagnostic.`, path });
    if (row.claim !== "promoted") continue;
    const hasPaired = (kind: UiEvidenceKind): boolean => row.evidence.some((entry) => entry.adapter === "web" && entry.kind === kind)
      && row.evidence.some((entry) => entry.adapter === "native" && entry.kind === kind);
    const sufficient = row.requiredTier === "rendered" ? hasPaired("rendered-screenshot")
      : row.requiredTier === "behavioral" ? hasPaired("behavior-report")
        : row.requiredTier === "accessibility-metadata" ? hasPaired("accessibility-snapshot")
          : row.requiredTier === "platform-assistive" ? row.evidence.some((entry) => entry.kind === "platform-transcript" && typeof entry.platform === "string" && entry.platform.length > 0)
            : row.requiredTier === "unsupported" ? row.evidence.some((entry) => entry.kind === "diagnostic") : false;
    if (!sufficient) diagnostics.push({ code: "TN_VERIFY_UI_PARITY_EVIDENCE_INSUFFICIENT", message: `Promoted UI parity row '${row.id}' lacks ${row.requiredTier} evidence.`, path: `${path}/evidence` });
    for (const [evidenceIndex, entry] of row.evidence.entries()) {
      if (entry.kind !== "diagnostic" && (entry.artifact === undefined || entry.artifact.trim() === "")) diagnostics.push({ code: "TN_VERIFY_UI_PARITY_ARTIFACT_MISSING", message: `Promoted UI parity row '${row.id}' has artifact-less ${entry.kind} evidence.`, path: `${path}/evidence/${evidenceIndex}/artifact` });
    }
  }
  for (const kind of nodeKinds) {
    const owners = dispositions.get(kind) ?? [];
    if (owners.length === 0) diagnostics.push({ code: "TN_VERIFY_UI_PARITY_NODE_KIND_MISSING", message: `UI node kind '${kind}' has no parity disposition.`, path: `nodeKinds/${kind}` });
    if (owners.length > 1) diagnostics.push({ code: "TN_VERIFY_UI_PARITY_NODE_KIND_DUPLICATE", message: `UI node kind '${kind}' has multiple parity dispositions: ${owners.join(", ")}.`, path: `nodeKinds/${kind}` });
  }
  return diagnostics;
}

export function requiredUiParityArtifacts(rows: readonly UiParityRow[] = UI_PARITY_ROWS): string[] {
  return [...new Set([
    ...rows.flatMap((row) => row.evidence.flatMap((entry) => entry.artifact === undefined ? [] : [entry.artifact])),
    ...UI_PARITY_SUPPORT_ARTIFACTS,
  ])].sort();
}

export function promotedUiCapabilitiesForFixture(fixtureId: string, rows: readonly UiParityRow[] = UI_PARITY_ROWS): string[] {
  return rows.filter((row) => row.claim === "promoted" && row.fixtureId === fixtureId && row.capability !== undefined).map((row) => row.capability!).sort();
}

export function uiParityRowsForArtifact(path: string, rows: readonly UiParityRow[] = UI_PARITY_ROWS): string[] {
  return rows.filter((row) => row.evidence.some((entry) => entry.artifact === path)).map((row) => row.id).sort();
}
