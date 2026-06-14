import type { IRenderedUi, IRenderedUiNode } from "./renderUi.js";

export interface IUiDomOverlay {
  element: HTMLElement;
  update(): void;
}

export function createUiDomOverlay(rendered: IRenderedUi, doc: Document = document): IUiDomOverlay {
  const nodes = new Map<string, HTMLElement>();
  const element = createNodeElement(rendered.root, rendered, nodes, doc);
  element.classList.add("tn-ui-overlay");
  Object.assign(element.style, {
    boxSizing: "border-box",
    inset: "0",
    pointerEvents: "none",
    position: "absolute",
  });
  updateNodeElement(rendered.root, nodes);

  return {
    element,
    update() {
      rendered.update();
      updateNodeElement(rendered.root, nodes);
    },
  };
}

function createNodeElement(
  node: IRenderedUiNode,
  rendered: IRenderedUi,
  nodes: Map<string, HTMLElement>,
  doc: Document,
): HTMLElement {
  const element = createElementForKind(node, doc);
  nodes.set(node.id, element);
  element.classList.add("tn-ui-node", `tn-ui-${node.kind}`);
  element.dataset.threenativeUiId = node.id;
  element.dataset.threenativeUiKind = node.kind;
  Object.assign(element.style, baseStyle(node));

  if (node.focusable) {
    element.tabIndex = 0;
  }
  if (node.kind === "button" || node.kind === "touchControl") {
    element.addEventListener("click", () => rendered.trigger(node.id));
  }
  if (node.kind === "bar") {
    const fill = doc.createElement("div");
    fill.classList.add("tn-ui-bar-fill");
    fill.dataset.threenativeUiBarFill = node.id;
    Object.assign(fill.style, {
      background: "currentColor",
      height: "100%",
      width: "0%",
    });
    element.append(fill);
  }

  for (const child of node.children) {
    element.append(createNodeElement(child, rendered, nodes, doc));
  }

  return element;
}

function createElementForKind(node: IRenderedUiNode, doc: Document): HTMLElement {
  if (node.kind === "button" || node.kind === "touchControl") {
    const button = doc.createElement("button");
    button.type = "button";
    return button;
  }
  return doc.createElement("div");
}

function updateNodeElement(node: IRenderedUiNode, nodes: Map<string, HTMLElement>): void {
  const element = nodes.get(node.id);
  if (element === undefined) {
    return;
  }

  if (node.kind === "text") {
    element.textContent = node.text ?? "";
  }
  if (node.kind === "button" || node.kind === "touchControl") {
    element.textContent = node.label ?? node.text ?? "";
    element.setAttribute("aria-label", node.label ?? node.text ?? node.id);
  }
  if (node.kind === "bar") {
    const max = node.max ?? 1;
    const value = node.value ?? 0;
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    element.setAttribute("role", "progressbar");
    element.setAttribute("aria-label", node.label ?? node.id);
    element.setAttribute("aria-valuemin", "0");
    element.setAttribute("aria-valuemax", String(max));
    element.setAttribute("aria-valuenow", String(value));
    element.dataset.threenativeUiValue = String(value);
    const fill = element.querySelector<HTMLElement>("[data-threenative-ui-bar-fill]");
    if (fill !== null) {
      fill.style.width = `${ratio * 100}%`;
    }
  }

  for (const child of node.children) {
    updateNodeElement(child, nodes);
  }
}

function baseStyle(node: IRenderedUiNode): Partial<CSSStyleDeclaration> {
  const style: Partial<CSSStyleDeclaration> = {
    boxSizing: "border-box",
    pointerEvents: "none",
  };
  if (node.kind === "row" || node.kind === "column" || node.kind === "stack") {
    style.display = "flex";
    style.gap = "8px";
    style.pointerEvents = "none";
  }
  if (node.kind === "row") {
    style.flexDirection = "row";
  }
  if (node.kind === "column") {
    style.flexDirection = "column";
  }
  if (node.kind === "stack") {
    style.display = "grid";
  }
  if (node.kind === "button" || node.kind === "touchControl") {
    style.pointerEvents = "auto";
  }
  if (node.kind === "bar") {
    style.border = "1px solid currentColor";
    style.height = "12px";
    style.overflow = "hidden";
    style.width = "160px";
  }
  return style;
}
