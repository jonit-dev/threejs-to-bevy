export type UiElementType = "bar" | "button" | "column" | "row" | "stack" | "text" | "touchControl" | "ui";
export type UiBinding =
  | { kind: "resource"; name: string; field?: string }
  | { component: string; entity: string; field?: string; kind: "component" };

export interface IUiNodeProps {
  action?: string;
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
    grow?: number;
    height?: number;
    justify?: "center" | "end" | "spaceBetween" | "start";
    padding?: number;
    rowGap?: number;
    width?: number;
  };
  max?: number;
  navigation?: {
    down?: string;
    left?: string;
    right?: string;
    up?: string;
  };
  safeArea?: {
    edges?: Array<"bottom" | "left" | "right" | "top">;
    mode: "avoid" | "none";
  };
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
    row: IUiNodeProps;
    stack: IUiNodeProps;
    text: IUiNodeProps;
    touchControl: IUiNodeProps;
    ui: IUiNodeProps;
  }
}
