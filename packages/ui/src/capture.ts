import type { IUiElement, UiChild } from "./jsx-runtime.js";

export type IUiBinding =
  | { kind: "resource"; name: string; field?: string }
  | { component: string; entity: string; field?: string; kind: "component" };

export interface IUiIr {
  fonts?: IUiFontAssetIr[];
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
  anchorId?: string;
  binding?: IUiBinding;
  children?: IUiNodeIr[];
  disabled?: boolean;
  focusable?: boolean;
  id: string;
  image?: IUiImageMetadataIr;
  kind: "bar" | "button" | "column" | "contextMenu" | "image" | "row" | "scrollbar" | "slider" | "stack" | "text" | "touchControl";
  label?: string;
  layout?: IUiLayoutIr;
  max?: number;
  min?: number;
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  orientation?: "horizontal" | "vertical";
  role?: "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";
  spans?: IUiRichTextSpanIr[];
  step?: number;
  style?: IUiStyleIr;
  src?: string;
  text?: string;
  value?: number;
  valueText?: string;
}

export interface IUiImageMetadataIr {
  atlas?: { x: number; y: number; width: number; height: number };
  flipX?: boolean;
  flipY?: boolean;
  nineSlice?: { left: number; right: number; top: number; bottom: number };
  scaleMode?: "contain" | "cover" | "stretch";
  sourceSize?: { width: number; height: number };
  tileSize?: { width: number; height: number };
  tint?: string;
}

export interface IUiFontAssetIr {
  asset: string;
  fallbackFamily?: string;
  family: string;
  glyphRanges?: Array<{ from: number; to: number }>;
  style?: "italic" | "normal";
  weight?: "bold" | "normal" | number;
}

export interface IUiRichTextSpanIr {
  accessibilityText?: string;
  color?: string;
  decoration?: "lineThrough" | "none" | "underline";
  fontFamily?: string;
  fontSize?: number;
  italic?: boolean;
  text: string;
  weight?: "bold" | "normal" | number;
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
  fontFamily?: string;
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
    ...(root.props.fonts === undefined ? {} : { fonts: root.props.fonts }),
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
  if (!["bar", "button", "column", "contextMenu", "image", "row", "scrollbar", "slider", "stack", "text", "touchControl"].includes(element.type)) {
    throw new Error(`Unsupported portable UI node '${element.type}'.`);
  }
  return {
    ...(element.props.action === undefined ? {} : { action: element.props.action }),
    ...(element.props.accessibilityLabel === undefined ? {} : { accessibilityLabel: element.props.accessibilityLabel }),
    ...(element.props.anchorId === undefined ? {} : { anchorId: element.props.anchorId }),
    ...(element.props.binding === undefined ? {} : { binding: element.props.binding }),
    ...(element.props.disabled === undefined ? {} : { disabled: element.props.disabled }),
    ...(element.props.focusable === undefined ? {} : { focusable: element.props.focusable }),
    ...(element.props.image === undefined ? {} : { image: element.props.image }),
    ...(element.props.label === undefined ? {} : { label: element.props.label }),
    ...(element.props.layout === undefined ? {} : { layout: element.props.layout }),
    ...(element.props.max === undefined ? {} : { max: element.props.max }),
    ...(element.props.min === undefined ? {} : { min: element.props.min }),
    ...(element.props.navigation === undefined ? {} : { navigation: element.props.navigation }),
    ...(element.props.orientation === undefined ? {} : { orientation: element.props.orientation }),
    ...(element.props.role === undefined ? {} : { role: element.props.role }),
    ...(element.props.spans === undefined ? {} : { spans: element.props.spans }),
    ...(element.props.step === undefined ? {} : { step: element.props.step }),
    ...(element.props.style === undefined ? {} : { style: element.props.style }),
    ...(element.props.src === undefined ? {} : { src: element.props.src }),
    ...(element.props.text === undefined ? {} : { text: element.props.text }),
    ...(element.props.value === undefined ? {} : { value: element.props.value }),
    ...(element.props.valueText === undefined ? {} : { valueText: element.props.valueText }),
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
