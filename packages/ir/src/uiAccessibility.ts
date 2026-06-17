import type { IUiIr, IUiNodeIr } from "./types.js";

export interface IUiAccessibilityDiagnostic {
  code: string;
  message: string;
  path: string;
  repairHint: string;
  severity: "error" | "warning";
}

export interface IUiAccessibilityReport {
  diagnostics: IUiAccessibilityDiagnostic[];
  ok: boolean;
}

const focusableNameKinds = new Set(["button", "slider", "scrollbar", "touchControl"]);

export function auditUiAccessibility(ui: IUiIr): IUiAccessibilityReport {
  const diagnostics: IUiAccessibilityDiagnostic[] = [];
  visitUiNode(ui.root, "ui.nodes[root]", diagnostics);
  return { diagnostics, ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error") };
}

function visitUiNode(node: IUiNodeIr, path: string, diagnostics: IUiAccessibilityDiagnostic[]): void {
  auditNode(node, path, diagnostics);
  for (const [index, child] of (node.children ?? []).entries()) {
    visitUiNode(child, `${path}.children[${index}]`, diagnostics);
  }
}

function auditNode(node: IUiNodeIr, path: string, diagnostics: IUiAccessibilityDiagnostic[]): void {
  const name = accessibleName(node);
  if (requiresAccessibleName(node) && name === undefined) {
    diagnostics.push({
      code: "TN_UI_A11Y_NAME_MISSING",
      message: `UI node '${node.id}' is focusable or interactive and needs an accessible name.`,
      path,
      repairHint: `${path}.accessibilityLabel`,
      severity: "error",
    });
  }
  if (node.disabled === true && node.focusable === true) {
    diagnostics.push({
      code: "TN_UI_A11Y_DISABLED_FOCUSABLE",
      message: `Disabled UI node '${node.id}' should not remain focusable.`,
      path: `${path}.focusable`,
      repairHint: `Set ${path}.focusable to false or remove the explicit focus override.`,
      severity: "error",
    });
  }
  if ((node.kind === "slider" || node.kind === "scrollbar") && name !== undefined && node.valueText === undefined) {
    diagnostics.push({
      code: "TN_UI_A11Y_VALUE_TEXT_RECOMMENDED",
      message: `UI node '${node.id}' should provide valueText for screen reader value announcements.`,
      path,
      repairHint: `${path}.valueText`,
      severity: "warning",
    });
  }
  if (node.kind === "contextMenu") {
    auditContextMenu(node, path, diagnostics);
  }
  if (node.kind === "image" && node.role !== "none" && name === undefined) {
    diagnostics.push({
      code: "TN_UI_A11Y_IMAGE_NAME_MISSING",
      message: `Image UI node '${node.id}' needs accessible text or role 'none'.`,
      path,
      repairHint: `${path}.accessibilityLabel or ${path}.role = "none"`,
      severity: "error",
    });
  }
  if (node.spans !== undefined) {
    auditSpans(node, path, diagnostics);
  }
}

function auditContextMenu(node: IUiNodeIr, path: string, diagnostics: IUiAccessibilityDiagnostic[]): void {
  for (const [index, child] of (node.children ?? []).entries()) {
    if (child.kind !== "button" && child.role !== "button") {
      diagnostics.push({
        code: "TN_UI_A11Y_CONTEXT_MENU_ITEM_ROLE_INVALID",
        message: `Context menu '${node.id}' child '${child.id}' should be an actionable menu item.`,
        path: `${path}.children[${index}]`,
        repairHint: `${path}.children[${index}].kind = "button"`,
        severity: "error",
      });
    }
  }
}

function auditSpans(node: IUiNodeIr, path: string, diagnostics: IUiAccessibilityDiagnostic[]): void {
  for (const [index, span] of node.spans?.entries() ?? []) {
    if (span.text.trim() === "" && span.accessibilityText === undefined) {
      diagnostics.push({
        code: "TN_UI_A11Y_ICON_SPAN_TEXT_MISSING",
        message: `UI node '${node.id}' span ${index} has no readable text.`,
        path: `${path}.spans[${index}]`,
        repairHint: `${path}.spans[${index}].accessibilityText`,
        severity: "warning",
      });
    }
  }
}

function requiresAccessibleName(node: IUiNodeIr): boolean {
  return node.focusable === true || focusableNameKinds.has(node.kind) || node.role === "button" || node.role === "progressbar";
}

function accessibleName(node: IUiNodeIr): string | undefined {
  const name =
    node.accessibilityLabel ??
    node.label ??
    node.text ??
    node.spans?.map((span) => span.accessibilityText ?? span.text).join("");
  return name === undefined || name.trim() === "" ? undefined : name;
}
