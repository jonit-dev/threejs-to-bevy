import type { IRenderedUi, IRenderedUiNode } from "./renderUi.js";

export interface IUiDomOverlay {
  element: HTMLElement;
  update(): void;
}

interface IUiDomOverlayState {
  openMenuId?: string;
}

export function createUiDomOverlay(rendered: IRenderedUi, doc: Document = document): IUiDomOverlay {
  const nodes = new Map<string, HTMLElement>();
  const state: IUiDomOverlayState = {};
  const element = createNodeElement(rendered.root, rendered, nodes, doc, state);
  element.classList.add("tn-ui-overlay");
  Object.assign(element.style, {
    boxSizing: "border-box",
    fontFamily: "monospace",
    inset: "0",
    pointerEvents: "none",
    position: "absolute",
  });
  updateNodeElement(rendered.root, nodes);
  updateContextMenus(rendered.root, nodes, state);
  doc.addEventListener?.("click", (event) => {
    if (state.openMenuId === undefined) {
      return;
    }
    const menu = nodes.get(state.openMenuId);
    const anchor = menuAnchor(rendered.root, state.openMenuId);
    const anchorElement = anchor === undefined ? undefined : nodes.get(anchor);
    const target = event.target as Node | null;
    if (target !== null && (menu?.contains(target) === true || anchorElement?.contains(target) === true)) {
      return;
    }
    closeContextMenu(rendered.root, nodes, state);
  });

  return {
    element,
    update() {
      rendered.update();
      updateNodeElement(rendered.root, nodes);
      updateContextMenus(rendered.root, nodes, state);
    },
  };
}

function createNodeElement(
  node: IRenderedUiNode,
  rendered: IRenderedUi,
  nodes: Map<string, HTMLElement>,
  doc: Document,
  state: IUiDomOverlayState,
): HTMLElement {
  const element = createElementForKind(node, doc);
  nodes.set(node.id, element);
  element.classList.add("tn-ui-node", `tn-ui-${node.kind}`);
  element.dataset.threenativeUiId = node.id;
  element.dataset.threenativeUiKind = node.kind;
  Object.assign(element.style, baseStyle(node));

  if (node.focusable) {
    element.tabIndex = 0;
    element.addEventListener("keydown", (event) => handleKeyboardNavigation(event, node.id, rendered, nodes, state));
  }
  if (node.kind === "contextMenu") {
    element.addEventListener("keydown", (event) => handleKeyboardNavigation(event, node.id, rendered, nodes, state));
  }
  if (node.kind === "button" || node.kind === "touchControl") {
    element.addEventListener("click", () => {
      if (node.disabled === true) {
        return;
      }
      const contextMenuId = contextMenuForAnchor(rendered.root, node.id);
      if (contextMenuId !== undefined) {
        openContextMenu(contextMenuId, rendered.root, nodes, state);
        return;
      }
      rendered.trigger(node.id);
      closeContextMenu(rendered.root, nodes, state);
    });
  }
  if (node.kind === "slider" || node.kind === "scrollbar") {
    element.addEventListener("input", () => {
      if (node.disabled !== true) {
        rendered.trigger(node.id, Number((element as HTMLInputElement).value));
      }
    });
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
    element.append(createNodeElement(child, rendered, nodes, doc, state));
  }

  return element;
}

function handleKeyboardNavigation(
  event: KeyboardEvent,
  currentId: string,
  rendered: IRenderedUi,
  nodes: Map<string, HTMLElement>,
  state: IUiDomOverlayState,
): void {
  if (event.key === "Escape") {
    const contextMenuId = containingContextMenu(rendered.root, currentId);
    if (contextMenuId !== undefined && state.openMenuId === contextMenuId) {
      event.preventDefault();
      closeContextMenu(rendered.root, nodes, state);
    }
    return;
  }
  const input = keyboardInput(event);
  if (input === undefined) {
    return;
  }
  event.preventDefault();
  if (input === "activate") {
    rendered.trigger(currentId);
    closeContextMenu(rendered.root, nodes, state);
    return;
  }
  const renderedNodes = renderedNodesById(rendered.root);
  const order = focusOrder(rendered, renderedNodes, state);
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

function focusOrder(rendered: IRenderedUi, nodes: Map<string, IRenderedUiNode>, state: IUiDomOverlayState): string[] {
  if (state.openMenuId !== undefined) {
    const menu = nodes.get(state.openMenuId);
    if (menu !== undefined) {
      return focusableDescendants(menu).map((node) => node.id);
    }
  }
  return (rendered.focusOrder ?? [...nodes.values()].filter((node) => node.focusable).map((node) => node.id)).filter((id) => {
    const node = nodes.get(id);
    return node?.focusable === true && node.disabled !== true;
  });
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
    return order[(index + 1) % order.length];
  }
  if (input === "shiftTab" || input === "up" || input === "left") {
    return order[(index - 1 + order.length) % order.length];
  }
  return undefined;
}

function createElementForKind(node: IRenderedUiNode, doc: Document): HTMLElement {
  if (node.kind === "image") {
    return doc.createElement("img");
  }
  if (node.kind === "slider" || node.kind === "scrollbar") {
    const input = doc.createElement("input");
    input.type = "range";
    return input;
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
    updateRichTextElement(element, node);
  }
  if (node.kind === "button" || node.kind === "touchControl") {
    element.textContent = node.label ?? node.text ?? "";
    element.setAttribute("aria-label", accessibleName(node) ?? node.id);
  }
  if (node.kind === "contextMenu") {
    element.setAttribute("role", "menu");
    element.setAttribute("aria-label", accessibleName(node) ?? node.id);
  }
  if (node.kind === "slider" || node.kind === "scrollbar") {
    const min = node.min ?? 0;
    const max = node.max ?? 1;
    const value = node.value ?? min;
    element.setAttribute("role", node.kind === "slider" ? "slider" : "scrollbar");
    element.setAttribute("aria-label", accessibleName(node) ?? node.id);
    element.setAttribute("aria-valuemin", String(min));
    element.setAttribute("aria-valuemax", String(max));
    element.setAttribute("aria-valuenow", String(value));
    if (node.valueText !== undefined) {
      element.setAttribute("aria-valuetext", node.valueText);
    }
    if (node.orientation !== undefined) {
      element.setAttribute("aria-orientation", node.orientation);
    }
    (element as HTMLInputElement).min = String(min);
    (element as HTMLInputElement).max = String(max);
    (element as HTMLInputElement).value = String(value);
    if (node.step !== undefined) {
      (element as HTMLInputElement).step = String(node.step);
    }
    element.dataset.threenativeUiValue = String(value);
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
    applyImageMetadata(element, node);
  }
  if (node.disabled === true) {
    element.setAttribute("aria-disabled", "true");
    (element as HTMLButtonElement | HTMLInputElement).disabled = true;
    element.tabIndex = -1;
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
  if (name !== undefined && node.kind !== "image" && node.role !== "none") {
    element.setAttribute("aria-label", name);
  }
}

function accessibleName(node: IRenderedUiNode): string | undefined {
  return node.accessibilityLabel ?? node.label ?? node.spans?.map((span) => span.accessibilityText ?? span.text).join("") ?? node.text;
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
  if (node.kind === "slider" || node.kind === "scrollbar") {
    style.pointerEvents = "auto";
  }
  if (node.kind === "contextMenu") {
    style.display = "none";
    style.position = "absolute";
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

function openContextMenu(
  menuId: string,
  root: IRenderedUiNode,
  nodes: Map<string, HTMLElement>,
  state: IUiDomOverlayState,
): void {
  state.openMenuId = menuId;
  updateContextMenus(root, nodes, state);
  const first = firstFocusableDescendant(nodes.get(menuId));
  first?.focus();
}

function closeContextMenu(root: IRenderedUiNode, nodes: Map<string, HTMLElement>, state: IUiDomOverlayState): void {
  if (state.openMenuId === undefined) {
    return;
  }
  state.openMenuId = undefined;
  updateContextMenus(root, nodes, state);
}

function updateContextMenus(root: IRenderedUiNode, nodes: Map<string, HTMLElement>, state: IUiDomOverlayState): void {
  visitRenderedNode(root, (node) => {
    if (node.kind !== "contextMenu") {
      return;
    }
    const element = nodes.get(node.id);
    if (element === undefined) {
      return;
    }
    const isOpen = state.openMenuId === node.id;
    element.dataset.threenativeUiOpen = String(isOpen);
    element.setAttribute("aria-hidden", String(!isOpen));
    element.style.display = isOpen ? "block" : "none";
    element.style.pointerEvents = isOpen ? "auto" : "none";
    if (isOpen && node.anchorId !== undefined) {
      const anchor = nodes.get(node.anchorId);
      const rect = anchor?.getBoundingClientRect();
      if (rect !== undefined) {
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.bottom}px`;
      }
    }
  });
}

function contextMenuForAnchor(root: IRenderedUiNode, anchorId: string): string | undefined {
  let menuId: string | undefined;
  visitRenderedNode(root, (node) => {
    if (node.kind === "contextMenu" && node.anchorId === anchorId) {
      menuId = node.id;
    }
  });
  return menuId;
}

function menuAnchor(root: IRenderedUiNode, menuId: string): string | undefined {
  return renderedNodesById(root).get(menuId)?.anchorId;
}

function containingContextMenu(root: IRenderedUiNode, nodeId: string): string | undefined {
  if (root.id === nodeId) {
    return root.kind === "contextMenu" ? root.id : undefined;
  }
  for (const child of root.children) {
    const contained = containingContextMenu(child, nodeId);
    if (contained !== undefined) {
      return root.kind === "contextMenu" ? root.id : contained;
    }
  }
  return undefined;
}

function focusableDescendants(root: IRenderedUiNode): IRenderedUiNode[] {
  const focusable: IRenderedUiNode[] = [];
  visitRenderedNode(root, (node) => {
    if (node.focusable && node.disabled !== true) {
      focusable.push(node);
    }
  });
  return focusable;
}

function firstFocusableDescendant(root: HTMLElement | undefined): HTMLElement | undefined {
  const all = root?.querySelectorAll<HTMLElement>("[tabindex=\"0\"]");
  return (all === undefined ? [] : Array.from(all)).find((element) => element.getAttribute("aria-disabled") !== "true");
}

function applyImageMetadata(element: HTMLElement, node: IRenderedUiNode): void {
  const metadata = node.image;
  if (metadata === undefined) {
    return;
  }
  if (metadata.scaleMode !== undefined) {
    element.style.objectFit = metadata.scaleMode === "stretch" ? "fill" : metadata.scaleMode;
  }
  const transforms = [];
  if (metadata.flipX === true) {
    transforms.push("scaleX(-1)");
  }
  if (metadata.flipY === true) {
    transforms.push("scaleY(-1)");
  }
  if (transforms.length > 0) {
    element.style.transform = transforms.join(" ");
  }
  if (metadata.tint !== undefined) {
    element.style.backgroundColor = metadata.tint;
  }
  if (metadata.tileSize !== undefined) {
    element.style.backgroundSize = `${metadata.tileSize.width}px ${metadata.tileSize.height}px`;
    element.style.backgroundRepeat = "repeat";
  }
  if (metadata.atlas !== undefined) {
    element.dataset.threenativeUiAtlas = `${metadata.atlas.x},${metadata.atlas.y},${metadata.atlas.width},${metadata.atlas.height}`;
  }
  if (metadata.nineSlice !== undefined) {
    element.dataset.threenativeUiNineSlice = `${metadata.nineSlice.top},${metadata.nineSlice.right},${metadata.nineSlice.bottom},${metadata.nineSlice.left}`;
  }
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
  if (visual.fontFamily !== undefined) {
    style.fontFamily = visual.fontFamily;
  }
  if (visual.fontWeight !== undefined) {
    style.fontWeight = visual.fontWeight;
  }
  if (visual.gradient !== undefined) {
    style.background = `linear-gradient(${visual.gradient.angle ?? 180}deg, ${visual.gradient.from}, ${visual.gradient.to})`;
  }
  if (visual.textAlign !== undefined) {
    style.textAlign = visual.textAlign;
  }
  if (visual.textDecoration !== undefined) {
    style.textDecoration = visual.textDecoration === "lineThrough" ? "line-through" : visual.textDecoration;
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
  if (visual.shadow !== undefined) {
    style.boxShadow = `${visual.shadow.offsetX ?? 0}px ${visual.shadow.offsetY ?? 0}px ${visual.shadow.blur ?? 0}px ${visual.shadow.spread ?? 0}px ${visual.shadow.color}`;
  }
}

function updateRichTextElement(element: HTMLElement, node: IRenderedUiNode): void {
  if (node.spans === undefined) {
    element.textContent = node.text ?? "";
    return;
  }
  element.textContent = "";
  for (const span of node.spans) {
    const child = element.ownerDocument?.createElement("span") ?? document.createElement("span");
    child.textContent = span.text;
    if (span.accessibilityText !== undefined) {
      child.setAttribute("aria-label", span.accessibilityText);
    }
    if (span.color !== undefined) {
      child.style.color = span.color;
    }
    if (span.fontFamily !== undefined) {
      child.style.fontFamily = span.fontFamily;
    }
    if (span.fontSize !== undefined) {
      child.style.fontSize = `${span.fontSize}px`;
    }
    if (span.weight !== undefined) {
      child.style.fontWeight = String(span.weight);
    }
    if (span.italic === true) {
      child.style.fontStyle = "italic";
    }
    if (span.decoration !== undefined) {
      child.style.textDecoration = span.decoration === "lineThrough" ? "line-through" : span.decoration;
    }
    element.append(child);
  }
}

function applyLayoutStyle(style: Partial<CSSStyleDeclaration>, layout: IRenderedUiNode["layout"]): void {
  if (layout === undefined) {
    return;
  }
  style.display = "flex";
  if (layout.grid !== undefined) {
    style.display = "grid";
    if (layout.grid.columns !== undefined) {
      style.gridTemplateColumns = `repeat(${layout.grid.columns}, minmax(0, 1fr))`;
    }
    if (layout.grid.rows !== undefined) {
      style.gridTemplateRows = `repeat(${layout.grid.rows}, minmax(0, 1fr))`;
    }
    if (layout.grid.autoFlow !== undefined) {
      style.gridAutoFlow = layout.grid.autoFlow;
    }
  }
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
