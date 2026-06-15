import type { IUiElement, UiChild } from "./jsx-runtime.js";

export interface IUiIr {
  focusOrder?: string[];
  inputActions?: {
    activate?: string;
    cancel?: string;
    next?: string;
    previous?: string;
  };
  safeArea?: {
    edges?: Array<"bottom" | "left" | "right" | "top">;
    mode: "avoid" | "none";
  };
  schema: "threenative.ui";
  version: "0.1.0";
  root: IUiNodeIr;
}

export interface IUiNodeIr {
  action?: string;
  binding?: unknown;
  children?: IUiNodeIr[];
  focusable?: boolean;
  id: string;
  kind: "bar" | "button" | "column" | "row" | "stack" | "text" | "touchControl";
  label?: string;
  layout?: IUiLayoutIr;
  max?: number;
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  text?: string;
  value?: number;
}

export interface IUiLayoutIr {
  align?: "center" | "end" | "start" | "stretch";
  columnGap?: number;
  direction?: "column" | "row";
  grow?: number;
  height?: number;
  inset?: {
    bottom?: number;
    left?: number;
    right?: number;
    top?: number;
  };
  justify?: "center" | "end" | "spaceBetween" | "start";
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  overflow?: "hidden" | "visible";
  padding?: number;
  position?: "absolute" | "relative";
  rowGap?: number;
  width?: number;
  zIndex?: number;
}

export function captureUi(root: IUiElement): IUiIr {
  if (root.type !== "ui") {
    throw new Error(`Portable UI root must be <ui>, got '${root.type}'.`);
  }
  return {
    ...(root.props.focusOrder === undefined ? {} : { focusOrder: root.props.focusOrder }),
    ...(root.props.inputActions === undefined ? {} : { inputActions: root.props.inputActions }),
    ...(root.props.safeArea === undefined ? {} : { safeArea: root.props.safeArea }),
    schema: "threenative.ui",
    version: "0.1.0",
    root: captureNode(root, "ui"),
  };
}

function captureNode(element: IUiElement, fallback: string): IUiNodeIr {
  if (element.type === "ui") {
    return {
      children: childrenOf(element).map((child, index) => captureNode(child, `${fallback}.${child.type}.${index}`)),
      id: element.props.id ?? fallback,
      kind: "stack",
    };
  }
  if (!["bar", "button", "column", "row", "stack", "text", "touchControl"].includes(element.type)) {
    throw new Error(`Unsupported portable UI node '${element.type}'.`);
  }
  return {
    ...(element.props.action === undefined ? {} : { action: element.props.action }),
    ...(element.props.binding === undefined ? {} : { binding: element.props.binding }),
    ...(element.props.focusable === undefined ? {} : { focusable: element.props.focusable }),
    ...(element.props.label === undefined ? {} : { label: element.props.label }),
    ...(element.props.layout === undefined ? {} : { layout: element.props.layout }),
    ...(element.props.max === undefined ? {} : { max: element.props.max }),
    ...(element.props.navigation === undefined ? {} : { navigation: element.props.navigation }),
    ...(element.props.text === undefined ? {} : { text: element.props.text }),
    ...(element.props.value === undefined ? {} : { value: element.props.value }),
    children: childrenOf(element).map((child, index) => captureNode(child, `${fallback}.${child.type}.${index}`)),
    id: element.props.id ?? fallback,
    kind: element.type,
  };
}

function childrenOf(element: IUiElement): IUiElement[] {
  return toArray(element.props.children).filter(isUiElement);
}

function toArray(children: UiChild | UiChild[]): UiChild[] {
  return Array.isArray(children) ? children : [children];
}

function isUiElement(value: unknown): value is IUiElement {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}
