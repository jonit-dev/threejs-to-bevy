export type UiElementType =
  | "bar"
  | "button"
  | "column"
  | "component"
  | "contextMenu"
  | "image"
  | "minimap"
  | "row"
  | "scrollbar"
  | "slider"
  | "stack"
  | "text"
  | "textInput"
  | "touchControl"
  | "ui";
export type UiAccessibilityRole = "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";
export type UiBinding =
  | { kind: "resource"; name: string; field?: string }
  | { component: string; entity: string; field?: string; kind: "component" };

export interface IUiCommonProps {
  action?: string;
  accessibilityLabel?: string;
  anchorId?: string;
  binding?: UiBinding;
  children?: UiChild | UiChild[];
  component?: IUiComponentInstance;
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
  max?: number;
  min?: number;
  minimap?: UiMinimapMetadata;
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
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  orientation?: "horizontal" | "vertical";
  role?: UiAccessibilityRole;
  safeArea?: {
    edges?: Array<"bottom" | "left" | "right" | "top">;
    mode: "avoid" | "none";
  };
  spans?: UiRichTextSpan[];
  src?: string;
  step?: number;
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
  text?: string;
  value?: number;
  valueText?: string;
}

export interface IUiContainerProps extends IUiCommonProps {}

export interface IUiTextProps extends IUiCommonProps {
  spans?: UiRichTextSpan[];
  text?: string;
}

export interface IUiActionProps extends IUiCommonProps {
  action: string;
}

export interface IUiRangeProps extends IUiActionProps {
  max?: number;
  min?: number;
  orientation?: "horizontal" | "vertical";
  step?: number;
  value?: number;
  valueText?: string;
}

export interface IUiScrollbarProps extends IUiCommonProps {
  action?: string;
  max?: number;
  min?: number;
  orientation?: "horizontal" | "vertical";
  step?: number;
  value?: number;
  valueText?: string;
}

export interface IUiTextInputProps extends IUiActionProps {
  text?: string;
  valueText?: string;
}

export interface IUiBarProps extends IUiCommonProps {
  max?: number;
  value?: number;
  valueText?: string;
}

export interface IUiImageProps extends IUiCommonProps {
  image?: UiImageMetadata;
  src?: string;
}

export interface IUiMinimapProps extends IUiCommonProps {
  minimap: UiMinimapMetadata;
}

export interface IUiComponentInstance {
  props?: Record<string, string | number | boolean>;
  ref: string;
  slots?: Record<string, IUiElement[]>;
}

export interface IUiComponentProps extends IUiCommonProps {
  component: IUiComponentInstance;
}

export type IUiNodeProps =
  | IUiActionProps
  | IUiBarProps
  | IUiCommonProps
  | IUiComponentProps
  | IUiContainerProps
  | IUiImageProps
  | IUiMinimapProps
  | IUiRangeProps
  | IUiScrollbarProps
  | IUiTextInputProps
  | IUiTextProps;

export type UiChild = IUiElement | false | null | undefined;

export interface UiMinimapMetadata {
  backgroundColor?: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  markers?: Array<{ color?: string; label?: string; radius?: number; x: number; z: number }>;
  paths: Array<{ color?: string; points: Array<[number, number]>; width?: number }>;
}

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

export interface IUiElement<TProps extends IUiNodeProps = IUiNodeProps> {
  props: TProps;
  type: UiElementType;
}

export function jsx<TProps extends IUiNodeProps>(type: UiElementType | ((props: TProps) => IUiElement), props: TProps): IUiElement {
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
    bar: IUiBarProps;
    button: IUiActionProps;
    column: IUiContainerProps;
    component: IUiComponentProps;
    contextMenu: IUiContainerProps;
    image: IUiImageProps;
    minimap: IUiMinimapProps;
    row: IUiContainerProps;
    scrollbar: IUiScrollbarProps;
    slider: IUiRangeProps;
    stack: IUiContainerProps;
    text: IUiTextProps;
    textInput: IUiTextInputProps;
    touchControl: IUiActionProps;
    ui: IUiContainerProps;
  }
}
