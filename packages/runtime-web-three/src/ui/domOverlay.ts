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
    element.addEventListener("keydown", (event) => handleKeyboardNavigation(event, node.id, rendered, nodes));
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

function handleKeyboardNavigation(
  event: KeyboardEvent,
  currentId: string,
  rendered: IRenderedUi,
  nodes: Map<string, HTMLElement>,
): void {
  const input = keyboardInput(event);
  if (input === undefined) {
    return;
  }
  event.preventDefault();
  if (input === "activate") {
    rendered.trigger(currentId);
    return;
  }
  const renderedNodes = renderedNodesById(rendered.root);
  const order = focusOrder(rendered, renderedNodes);
  const targetId = navigationTarget(renderedNodes.get(currentId), input) ?? sequentialTarget(order, currentId, input);
  if (targetId !== undefined && targetId !== currentId) {
    nodes.get(targetId)?.focus();
  }
}

function keyboardInput(event: KeyboardEvent): "activate" | "down" | "left" | "right" | "shiftTab" | "tab" | "up" | undefined {
  if (event.key === "Enter" || event.key === " ") {
    return "activate";
  }
  if (event.key === "Tab") {
    return event.shiftKey ? "shiftTab" : "tab";
  }
  if (event.key === "ArrowDown") {
    return "down";
  }
  if (event.key === "ArrowLeft") {
    return "left";
  }
  if (event.key === "ArrowRight") {
    return "right";
  }
  if (event.key === "ArrowUp") {
    return "up";
  }
  return undefined;
}

function renderedNodesById(root: IRenderedUiNode): Map<string, IRenderedUiNode> {
  const nodes = new Map<string, IRenderedUiNode>();
  visitRenderedNode(root, (node) => nodes.set(node.id, node));
  return nodes;
}

function visitRenderedNode(node: IRenderedUiNode, callback: (node: IRenderedUiNode) => void): void {
  callback(node);
  for (const child of node.children) {
    visitRenderedNode(child, callback);
  }
}

function focusOrder(rendered: IRenderedUi, nodes: Map<string, IRenderedUiNode>): string[] {
  return (rendered.focusOrder ?? [...nodes.values()].filter((node) => node.focusable).map((node) => node.id)).filter(
    (id) => nodes.get(id)?.focusable === true,
  );
}

function navigationTarget(node: IRenderedUiNode | undefined, input: string): string | undefined {
  if (input === "up" || input === "right" || input === "down" || input === "left") {
    return node?.navigation?.[input];
  }
  return undefined;
}

function sequentialTarget(order: readonly string[], current: string, input: string): string | undefined {
  const index = order.indexOf(current);
  if (index < 0) {
    return undefined;
  }
  if (input === "tab" || input === "down" || input === "right") {
    return order[Math.min(order.length - 1, index + 1)];
  }
  if (input === "shiftTab" || input === "up" || input === "left") {
    return order[Math.max(0, index - 1)];
  }
  return undefined;
}

function createElementForKind(node: IRenderedUiNode, doc: Document): HTMLElement {
  if (node.kind === "image") {
    return doc.createElement("img");
  }
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
    element.setAttribute("aria-label", accessibleName(node) ?? node.id);
  }
  if (node.kind === "bar") {
    const max = node.max ?? 1;
    const value = node.value ?? 0;
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    element.setAttribute("role", "progressbar");
    element.setAttribute("aria-label", accessibleName(node) ?? node.id);
    element.setAttribute("aria-valuemin", "0");
    element.setAttribute("aria-valuemax", String(max));
    element.setAttribute("aria-valuenow", String(value));
    element.dataset.threenativeUiValue = String(value);
    const fill = element.querySelector<HTMLElement>("[data-threenative-ui-bar-fill]");
    if (fill !== null) {
      fill.style.width = `${ratio * 100}%`;
    }
  }
  if (node.kind === "image") {
    element.setAttribute("alt", accessibleName(node) ?? "");
    if (node.src !== undefined) {
      element.setAttribute("src", node.src);
    }
  }
  applyAccessibilityAttributes(element, node);

  for (const child of node.children) {
    updateNodeElement(child, nodes);
  }
}

function applyAccessibilityAttributes(element: HTMLElement, node: IRenderedUiNode): void {
  const role = domRole(node.role);
  if (role !== undefined) {
    element.setAttribute("role", role);
  }
  const name = accessibleName(node);
  if (name !== undefined && node.kind !== "image") {
    element.setAttribute("aria-label", name);
  }
}

function accessibleName(node: IRenderedUiNode): string | undefined {
  return node.accessibilityLabel ?? node.label ?? node.text;
}

function domRole(role: IRenderedUiNode["role"]): string | undefined {
  if (role === undefined) {
    return undefined;
  }
  return role === "none" ? "presentation" : role;
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
  if (node.kind === "image") {
    style.display = "block";
    style.maxWidth = "100%";
    style.objectFit = "contain";
  }
  applyLayoutStyle(style, node.layout);
  applyVisualStyle(style, node.style);
  if (node.kind === "bar") {
    style.border = "1px solid currentColor";
    style.height = "12px";
    style.overflow = "hidden";
    style.width = "160px";
  }
  return style;
}

function applyVisualStyle(style: Partial<CSSStyleDeclaration>, visual: IRenderedUiNode["style"]): void {
  if (visual === undefined) {
    return;
  }
  if (visual.backgroundColor !== undefined) {
    style.backgroundColor = visual.backgroundColor;
  }
  if (visual.color !== undefined) {
    style.color = visual.color;
  }
  if (visual.fontSize !== undefined) {
    style.fontSize = `${visual.fontSize}px`;
  }
  if (visual.textAlign !== undefined) {
    style.textAlign = visual.textAlign;
  }
  if (visual.wrap !== undefined) {
    style.whiteSpace = visual.wrap === "none" ? "nowrap" : "normal";
    style.overflowWrap = visual.wrap === "character" ? "anywhere" : "normal";
  }
  if (visual.borderWidth !== undefined) {
    style.borderStyle = "solid";
    style.borderWidth = `${visual.borderWidth}px`;
  }
  if (visual.borderColor !== undefined) {
    style.borderColor = visual.borderColor;
  }
  if (visual.borderRadius !== undefined) {
    style.borderRadius = `${visual.borderRadius}px`;
  }
  if (visual.opacity !== undefined) {
    style.opacity = String(visual.opacity);
  }
}

function applyLayoutStyle(style: Partial<CSSStyleDeclaration>, layout: IRenderedUiNode["layout"]): void {
  if (layout === undefined) {
    return;
  }
  style.display = "flex";
  if (layout.direction !== undefined) {
    style.flexDirection = layout.direction;
  }
  if (layout.justify !== undefined) {
    style.justifyContent = {
      center: "center",
      end: "flex-end",
      spaceBetween: "space-between",
      start: "flex-start",
    }[layout.justify];
  }
  if (layout.align !== undefined) {
    style.alignItems = {
      center: "center",
      end: "flex-end",
      start: "flex-start",
      stretch: "stretch",
    }[layout.align];
  }
  if (layout.rowGap !== undefined) {
    style.rowGap = `${layout.rowGap}px`;
  }
  if (layout.columnGap !== undefined) {
    style.columnGap = `${layout.columnGap}px`;
  }
  if (layout.padding !== undefined) {
    style.padding = `${layout.padding}px`;
  }
  if (layout.position !== undefined) {
    style.position = layout.position;
  }
  if (layout.inset?.top !== undefined) {
    style.top = `${layout.inset.top}px`;
  }
  if (layout.inset?.right !== undefined) {
    style.right = `${layout.inset.right}px`;
  }
  if (layout.inset?.bottom !== undefined) {
    style.bottom = `${layout.inset.bottom}px`;
  }
  if (layout.inset?.left !== undefined) {
    style.left = `${layout.inset.left}px`;
  }
  if (layout.width !== undefined) {
    style.width = `${layout.width}px`;
  }
  if (layout.height !== undefined) {
    style.height = `${layout.height}px`;
  }
  if (layout.minWidth !== undefined) {
    style.minWidth = `${layout.minWidth}px`;
  }
  if (layout.maxWidth !== undefined) {
    style.maxWidth = `${layout.maxWidth}px`;
  }
  if (layout.minHeight !== undefined) {
    style.minHeight = `${layout.minHeight}px`;
  }
  if (layout.maxHeight !== undefined) {
    style.maxHeight = `${layout.maxHeight}px`;
  }
  if (layout.grow !== undefined) {
    style.flexGrow = String(layout.grow);
  }
  if (layout.overflow !== undefined) {
    if (layout.overflow === "scroll") {
      style.overflowX = "hidden";
      style.overflowY = "auto";
    } else {
      style.overflow = layout.overflow;
    }
  }
  if (layout.zIndex !== undefined) {
    style.zIndex = String(layout.zIndex);
  }
}
