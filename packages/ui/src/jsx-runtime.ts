export type UiElementType = "bar" | "button" | "column" | "contextMenu" | "image" | "row" | "scrollbar" | "slider" | "stack" | "text" | "touchControl" | "ui";
export type UiAccessibilityRole = "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";
export type UiBinding =
  | { kind: "resource"; name: string; field?: string }
  | { component: string; entity: string; field?: string; kind: "component" };

export interface IUiNodeProps {
  action?: string;
  accessibilityLabel?: string;
  anchorId?: string;
  binding?: UiBinding;
  children?: UiChild | UiChild[];
  disabled?: boolean;
  focusable?: boolean;
  focusOrder?: string[];
  fonts?: UiFontAsset[];
  id?: string;
  inputActions?: {
    activate?: string;
    cancel?: string;
    next?: string;
    previous?: string;
  };
  image?: UiImageMetadata;
  label?: string;
  layout?: {
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
  };
  max?: number;
  min?: number;
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  orientation?: "horizontal" | "vertical";
  role?: UiAccessibilityRole;
  spans?: UiRichTextSpan[];
  safeArea?: {
    edges?: Array<"bottom" | "left" | "right" | "top">;
    mode: "avoid" | "none";
  };
  style?: {
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
  };
  src?: string;
  step?: number;
  text?: string;
  value?: number;
  valueText?: string;
}

export type UiChild = IUiElement | false | null | undefined;

export interface UiFontAsset {
  asset: string;
  fallbackFamily?: string;
  family: string;
  glyphRanges?: Array<{ from: number; to: number }>;
  style?: "italic" | "normal";
  weight?: "bold" | "normal" | number;
}

export interface UiRichTextSpan {
  accessibilityText?: string;
  color?: string;
  decoration?: "lineThrough" | "none" | "underline";
  fontFamily?: string;
  fontSize?: number;
  italic?: boolean;
  text: string;
  weight?: "bold" | "normal" | number;
}

export interface UiImageMetadata {
  atlas?: { x: number; y: number; width: number; height: number };
  flipX?: boolean;
  flipY?: boolean;
  nineSlice?: { left: number; right: number; top: number; bottom: number };
  scaleMode?: "contain" | "cover" | "stretch";
  sourceSize?: { width: number; height: number };
  tileSize?: { width: number; height: number };
  tint?: string;
}

export interface IUiElement {
  props: IUiNodeProps;
  type: UiElementType;
}

export function jsx(type: UiElementType | ((props: IUiNodeProps) => IUiElement), props: IUiNodeProps): IUiElement {
  if (typeof type === "function") {
    return type(props);
  }
  return { props: props ?? {}, type };
}

export const jsxs = jsx;
export const Fragment = "stack";

export namespace JSX {
  export type Element = IUiElement;

  export interface IntrinsicElements {
    bar: IUiNodeProps;
    button: IUiNodeProps;
    column: IUiNodeProps;
    contextMenu: IUiNodeProps;
    image: IUiNodeProps;
    row: IUiNodeProps;
    scrollbar: IUiNodeProps;
    slider: IUiNodeProps;
    stack: IUiNodeProps;
    text: IUiNodeProps;
    touchControl: IUiNodeProps;
    ui: IUiNodeProps;
  }
}
