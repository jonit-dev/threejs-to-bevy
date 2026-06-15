export type UiElementType = "bar" | "button" | "column" | "image" | "row" | "stack" | "text" | "touchControl" | "ui";
export type UiAccessibilityRole = "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";
export type UiBinding =
  | { kind: "resource"; name: string; field?: string }
  | { component: string; entity: string; field?: string; kind: "component" };

export interface IUiNodeProps {
  action?: string;
  accessibilityLabel?: string;
  binding?: UiBinding;
  children?: UiChild | UiChild[];
  focusable?: boolean;
  focusOrder?: string[];
  id?: string;
  inputActions?: {
    activate?: string;
    cancel?: string;
    next?: string;
    previous?: string;
  };
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
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  role?: UiAccessibilityRole;
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
  text?: string;
  value?: number;
}

export type UiChild = IUiElement | false | null | undefined;

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
    image: IUiNodeProps;
    row: IUiNodeProps;
    stack: IUiNodeProps;
    text: IUiNodeProps;
    touchControl: IUiNodeProps;
    ui: IUiNodeProps;
  }
}
