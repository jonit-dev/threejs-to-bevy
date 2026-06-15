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
  accessibilityLabel?: string;
  binding?: unknown;
  children?: IUiNodeIr[];
  focusable?: boolean;
  id: string;
  kind: "bar" | "button" | "column" | "image" | "row" | "stack" | "text" | "touchControl";
  label?: string;
  layout?: IUiLayoutIr;
  max?: number;
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  role?: "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";
  style?: IUiStyleIr;
  src?: string;
  text?: string;
  value?: number;
}

export interface IUiLayoutIr {
  align?: "center" | "end" | "start" | "stretch";
  columnGap?: number;
  direction?: "column" | "row";
  grid?: {
    autoFlow?: "column" | "row";
    columns?: number;
    rows?: number;
  };
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
  overflow?: "hidden" | "scroll" | "visible";
  padding?: number;
  position?: "absolute" | "relative";
  rowGap?: number;
  width?: number;
  zIndex?: number;
}

export interface IUiStyleIr {
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: "bold" | "normal";
  gradient?: {
    angle?: number;
    from: string;
    kind: "linear";
    to: string;
  };
  opacity?: number;
  shadow?: {
    blur?: number;
    color: string;
    offsetX?: number;
    offsetY?: number;
    spread?: number;
  };
  textDecoration?: "lineThrough" | "none" | "underline";
  textAlign?: "center" | "left" | "right";
  wrap?: "character" | "none" | "word";
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
      ...(element.props.accessibilityLabel === undefined ? {} : { accessibilityLabel: element.props.accessibilityLabel }),
      children: childrenOf(element).map((child, index) => captureNode(child, `${fallback}.${child.type}.${index}`)),
      id: element.props.id ?? fallback,
      kind: "stack",
      ...(element.props.role === undefined ? {} : { role: element.props.role }),
    };
  }
  if (!["bar", "button", "column", "image", "row", "stack", "text", "touchControl"].includes(element.type)) {
    throw new Error(`Unsupported portable UI node '${element.type}'.`);
  }
  return {
    ...(element.props.action === undefined ? {} : { action: element.props.action }),
    ...(element.props.accessibilityLabel === undefined ? {} : { accessibilityLabel: element.props.accessibilityLabel }),
    ...(element.props.binding === undefined ? {} : { binding: element.props.binding }),
    ...(element.props.focusable === undefined ? {} : { focusable: element.props.focusable }),
    ...(element.props.label === undefined ? {} : { label: element.props.label }),
    ...(element.props.layout === undefined ? {} : { layout: element.props.layout }),
    ...(element.props.max === undefined ? {} : { max: element.props.max }),
    ...(element.props.navigation === undefined ? {} : { navigation: element.props.navigation }),
    ...(element.props.role === undefined ? {} : { role: element.props.role }),
    ...(element.props.style === undefined ? {} : { style: element.props.style }),
    ...(element.props.src === undefined ? {} : { src: element.props.src }),
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
