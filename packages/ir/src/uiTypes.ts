import type { SchemaVersion, UiSchema, Vec3 } from "./types.js";

export type IUiBinding =
  | { fields?: readonly string[]; field?: string; format?: string; kind: "resource"; name: string }
  | { component: string; entity: string; fields?: readonly string[]; field?: string; format?: string; kind: "component" };
export type IUiAccessibilityRole = "button" | "group" | "image" | "list" | "listitem" | "none" | "progressbar" | "text";
export type UiTargetProfileClass = "desktop" | "mobile" | "tablet";
export const UI_NODE_KINDS = ["bar", "button", "column", "component", "contextMenu", "image", "minimap", "row", "scrollbar", "slider", "stack", "text", "textInput", "touchControl"] as const;
export type UiNodeKind = (typeof UI_NODE_KINDS)[number];

export interface IUiResponsiveRuleIr {
  layout?: IUiLayoutIr;
  style?: IUiStyleIr;
  target: UiTargetProfileClass;
}

export interface IUiVirtualRangeIr {
  buffer?: number;
  itemCount: number;
  itemExtent: number;
  orientation?: "horizontal" | "vertical";
  viewportExtent: number;
}

export interface IUiGlyphPromptIr {
  action: string;
  glyphSet?: "gamepad" | "keyboard" | "touch";
  label?: string;
}

export interface IUiTooltipIr {
  anchor: string;
  delayMs?: number;
  description: string;
  dismissAction?: string;
  focus?: "move" | "preserve";
  open: "focus" | "hover" | "manual";
}

export interface IUiLocalizationIr {
  cases?: Record<string, string>;
  fallback: string;
  key: string;
  params?: Record<string, string | number | boolean>;
}

export interface IUiFeedbackIr {
  audio?: string;
  haptic?: string;
  trigger: "activate" | "focus" | "valueChange";
}

export interface IUiProgressPresentationIr {
  cooldown?: boolean;
  format?: string;
  kind?: "bar" | "radial" | "ring" | "segmented" | "text";
  segments?: number;
}

export type UiEffectPresetKind = "focusRing" | "glow" | "outline" | "pulse" | "tint";
export type UiEffectTrigger = "disabled" | "focus" | "hover" | "predicate" | "selected";

export interface IUiEffectPredicateIr {
  component?: string;
  entity?: string;
  field?: string;
  resource?: string;
  equals?: string | number | boolean;
}

export interface IUiEffectPresetIr {
  color?: string;
  fallback?: "none" | "outline" | "shadow" | "tint";
  id: string;
  intensity?: number;
  kind: UiEffectPresetKind;
  predicate?: IUiEffectPredicateIr;
  pulse?: {
    durationMs: number;
    iterations?: number;
  };
  radius?: number;
  trigger: UiEffectTrigger;
}

export interface IUiAttachmentIr {
  anchor?: "bottom" | "center" | "left" | "right" | "top";
  clamp?: "none" | "screenEdge";
  distanceScale?: {
    max: number;
    min: number;
  };
  localOffset?: Vec3;
  maxDistance?: number;
  occlusion?: "fade" | "hide" | "show";
  sortPriority?: number;
  target: {
    binding?: string;
    id?: string;
    kind: "entity" | "prefabInstance" | "selectedEntity";
  };
}

export interface IUiNodeIr {
  action?: string;
  accessibilityLabel?: string;
  anchorId?: string;
  attachTo?: IUiAttachmentIr;
  binding?: IUiBinding;
  children?: IUiNodeIr[];
  component?: IUiComponentInstanceIr;
  disabled?: boolean;
  effects?: readonly IUiEffectPresetIr[];
  focusable?: boolean;
  feedback?: readonly IUiFeedbackIr[];
  glyph?: IUiGlyphPromptIr;
  id: string;
  image?: IUiImageMetadataIr;
  kind: UiNodeKind;
  localization?: IUiLocalizationIr;
  minimap?: IUiMinimapMetadataIr;
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
  role?: IUiAccessibilityRole;
  progress?: IUiProgressPresentationIr;
  responsive?: readonly IUiResponsiveRuleIr[];
  spans?: IUiRichTextSpanIr[];
  step?: number;
  style?: IUiStyleIr;
  src?: string;
  text?: string;
  tokenRefs?: IUiTokenRefsIr;
  tooltip?: IUiTooltipIr;
  value?: number;
  valueText?: string;
  virtualRange?: IUiVirtualRangeIr;
}

export interface IUiComponentPropIr {
  defaultValue?: string | number | boolean;
  id: string;
  required?: boolean;
}

export interface IUiComponentDefinitionIr {
  id: string;
  props?: readonly IUiComponentPropIr[];
  root: IUiNodeIr;
  slots?: readonly string[];
}

export interface IUiComponentInstanceIr {
  props?: Record<string, string | number | boolean>;
  ref: string;
  slots?: Record<string, IUiNodeIr[]>;
}

export interface IUiGeneratedNodeProvenanceIr {
  component: string;
  instance: string;
  node: string;
  propPaths?: Record<string, string>;
  sourcePath: string;
  slot?: string;
}

export type UiScreenRole = "dialog" | "hud" | "loading" | "menu" | "modal" | "overlay";
export type UiScreenStackPolicy = "exclusiveModal" | "overlay" | "pop" | "push" | "replace";
export type UiFocusRestorePolicy = "none" | "previous";
export type UiInputCapturePolicy = "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard";

export interface IUiFocusScopeIr {
  backAction?: string;
  entry: string;
  escapeAction?: string;
  inputCapture: UiInputCapturePolicy;
  restore?: UiFocusRestorePolicy;
  trap?: boolean;
}

export interface IUiScreenIr {
  active?: boolean;
  focusScope?: IUiFocusScopeIr;
  hidden?: boolean;
  id: string;
  role: UiScreenRole;
  root: string;
  stackPolicy?: UiScreenStackPolicy;
}

export interface IUiScreenStackIr {
  active: readonly string[];
  policy?: UiScreenStackPolicy;
  transitions?: readonly IUiScreenTransitionObservationIr[];
}

export interface IUiScreenTransitionObservationIr {
  from?: string;
  kind: UiScreenStackPolicy;
  to?: string;
}

export interface IUiTokenRefsIr {
  image?: {
    tint?: string;
  };
  layout?: Partial<Record<keyof Omit<IUiLayoutIr, "grid" | "inset">, string>> & {
    inset?: Partial<Record<"bottom" | "left" | "right" | "top", string>>;
  };
  style?: Partial<Record<keyof Omit<IUiStyleIr, "gradient" | "shadow">, string>> & {
    gradient?: {
      from?: string;
      to?: string;
    };
    shadow?: {
      color?: string;
    };
  };
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

export interface IUiMinimapMetadataIr {
  backgroundColor?: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  markers?: Array<{ color?: string; label?: string; radius?: number; x: number; z: number }>;
  paths: Array<{ color?: string; points: Array<[number, number]>; width?: number }>;
}

export interface IUiFontAssetIr {
  asset: string;
  boldAsset?: string;
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

export type UiThemeTokenKind =
  | "border"
  | "color"
  | "focusRing"
  | "fontFamily"
  | "gradient"
  | "icon"
  | "image"
  | "radius"
  | "shadow"
  | "spacing"
  | "textSize";

export interface IUiThemeTokenIr {
  id: string;
  kind: UiThemeTokenKind;
  value: unknown;
}

export interface IUiComponentVariantIr {
  id: string;
  tokenRefs: IUiTokenRefsIr;
}

export interface IUiThemeIr {
  componentVariants?: readonly IUiComponentVariantIr[];
  tokens: readonly IUiThemeTokenIr[];
}

export interface IUiIr {
  components?: readonly IUiComponentDefinitionIr[];
  fonts?: IUiFontAssetIr[];
  focusOrder?: string[];
  generatedNodeProvenance?: Record<string, IUiGeneratedNodeProvenanceIr>;
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
  schema: UiSchema;
  screenStack?: IUiScreenStackIr;
  screens?: readonly IUiScreenIr[];
  theme?: IUiThemeIr;
  toastQueues?: readonly IUiToastQueueIr[];
  version: SchemaVersion;
  root: IUiNodeIr;
}

export interface IUiToastQueueIr {
  coalesce?: "count" | "drop" | "none";
  durationMs: number;
  id: string;
  maxVisible: number;
  priority?: "fifo" | "high-first";
  stack?: "down" | "up";
  toasts?: readonly IUiToastIr[];
}

export interface IUiToastIr {
  id: string;
  key?: string;
  priority?: number;
  text: string;
}
