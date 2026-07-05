import { SdkError } from "./errors.js";

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

export interface IUiThemeToken {
  id: string;
  kind: UiThemeTokenKind;
  value: unknown;
}

export interface IUiTheme {
  tokens: readonly IUiThemeToken[];
}

export interface IUiComponentProp {
  defaultValue?: string | number | boolean;
  id: string;
  required?: boolean;
}

export interface IUiComponentDefinition {
  id: string;
  props?: readonly IUiComponentProp[];
  root: unknown;
  slots?: readonly string[];
}

export interface IUiComponentInstance {
  props?: Record<string, string | number | boolean>;
  ref: string;
}

export interface IUiGlyphPrompt {
  action: string;
  glyphSet?: "gamepad" | "keyboard" | "touch";
  label?: string;
}

export interface IUiTooltip {
  anchor: string;
  delayMs?: number;
  description: string;
  dismissAction?: string;
  focus?: "move" | "preserve";
  open: "focus" | "hover" | "manual";
}

export interface IUiLocalization {
  cases?: Record<string, string>;
  fallback: string;
  key: string;
  params?: Record<string, string | number | boolean>;
}

export interface IUiToastQueue {
  coalesce?: "count" | "drop" | "none";
  durationMs: number;
  id: string;
  maxVisible: number;
  priority?: "fifo" | "high-first";
  stack?: "down" | "up";
}

export type UiRecipeKind =
  | "dialog-box"
  | "enemy-health-bar"
  | "hud-status-cluster"
  | "interact-prompt"
  | "inventory-grid"
  | "item-detail-panel"
  | "loading-overlay"
  | "nameplate"
  | "notification-toast"
  | "off-screen-indicator"
  | "pause-menu"
  | "pickup-label"
  | "quest-marker"
  | "settings-list";

export interface IUiRecipeOptions {
  actions?: Record<string, string>;
  bindings?: Record<string, string>;
  id?: string;
  props?: Record<string, string | number | boolean>;
}

export interface IUiRecipeSource {
  bindings: Array<{ node: string; resource: string }>;
  components: Array<{ id: string; props?: readonly IUiComponentProp[]; root: unknown; slots?: readonly string[] }>;
  focusOrder: string[];
  nodes: unknown[];
  provenance: Record<string, unknown>;
  screens: unknown[];
}

type UiRecipeTargetClass = "desktop" | "mobile" | "tablet";

export interface IUnsupportedUiWidgetOptions {
  virtualKeyboard?: boolean;
}

export function uiTheme(tokens: readonly IUiThemeToken[]): IUiTheme {
  return { tokens: [...tokens].sort((left, right) => left.id.localeCompare(right.id)) };
}

export function uiToken(id: string, kind: UiThemeTokenKind, value: unknown): IUiThemeToken {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_UI_THEME_TOKEN_ID_INVALID", "UI theme token id must be non-empty.");
  }
  return { id, kind, value };
}

export function uiColorToken(id: string, value: string): IUiThemeToken {
  return uiToken(id, "color", value);
}

export function uiSpacingToken(id: string, value: number): IUiThemeToken {
  return uiToken(id, "spacing", value);
}

export function uiRadiusToken(id: string, value: number): IUiThemeToken {
  return uiToken(id, "radius", value);
}

export function uiTextSizeToken(id: string, value: number): IUiThemeToken {
  return uiToken(id, "textSize", value);
}

export function uiFontFamilyToken(id: string, value: string): IUiThemeToken {
  return uiToken(id, "fontFamily", value);
}

export function uiComponent(definition: IUiComponentDefinition): IUiComponentDefinition {
  if (definition.id.trim() === "") {
    throw new SdkError("TN_SDK_UI_COMPONENT_ID_INVALID", "UI component id must be non-empty.");
  }
  return {
    ...definition,
    ...(definition.props === undefined ? {} : { props: [...definition.props].sort((left, right) => left.id.localeCompare(right.id)) }),
    ...(definition.slots === undefined ? {} : { slots: [...definition.slots].sort() }),
  };
}

export function uiComponentInstance(ref: string, options: { props?: Record<string, string | number | boolean> } = {}): IUiComponentInstance {
  if (ref.trim() === "") {
    throw new SdkError("TN_SDK_UI_COMPONENT_REF_INVALID", "UI component instance ref must be non-empty.");
  }
  return { ref, ...(options.props === undefined ? {} : { props: { ...options.props } }) };
}

export function uiGlyphPrompt(action: string, options: Omit<IUiGlyphPrompt, "action"> = {}): IUiGlyphPrompt {
  if (action.trim() === "") {
    throw new SdkError("TN_SDK_UI_GLYPH_ACTION_INVALID", "UI glyph action must be non-empty.");
  }
  return { action, ...options };
}

export function uiTooltip(anchor: string, description: string, options: Omit<IUiTooltip, "anchor" | "description" | "open"> & { open?: IUiTooltip["open"] } = {}): IUiTooltip {
  if (anchor.trim() === "" || description.trim() === "") {
    throw new SdkError("TN_SDK_UI_TOOLTIP_INVALID", "UI tooltip anchor and description must be non-empty.");
  }
  return { anchor, description, open: options.open ?? "focus", ...options };
}

export function uiLocalization(key: string, fallback: string, options: { cases?: Record<string, string>; params?: Record<string, string | number | boolean> } = {}): IUiLocalization {
  if (key.trim() === "" || fallback.trim() === "") {
    throw new SdkError("TN_SDK_UI_LOCALIZATION_INVALID", "UI localization key and fallback must be non-empty.");
  }
  return {
    key,
    fallback,
    ...(options.cases === undefined ? {} : { cases: { ...options.cases } }),
    ...(options.params === undefined ? {} : { params: { ...options.params } }),
  };
}

export function uiToastQueue(id: string, options: Omit<IUiToastQueue, "id">): IUiToastQueue {
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_UI_TOAST_QUEUE_ID_INVALID", "UI toast queue id must be non-empty.");
  }
  return { id, ...options };
}

export function uiRecipe(kind: UiRecipeKind, options: IUiRecipeOptions = {}): IUiRecipeSource {
  const id = options.id ?? kind;
  if (id.trim() === "") {
    throw new SdkError("TN_SDK_UI_RECIPE_ID_INVALID", "UI recipe id must be non-empty.");
  }
  switch (kind) {
    case "inventory-grid":
      return inventoryGridRecipe(id, options);
    case "settings-list":
      return settingsListRecipe(id, options);
    case "nameplate":
    case "enemy-health-bar":
    case "interact-prompt":
    case "pickup-label":
    case "quest-marker":
    case "off-screen-indicator":
      return attachedUiRecipe(id, kind, options);
    case "hud-status-cluster":
      return simpleRecipe(id, kind, "hud", ["health", "score"], options);
    case "pause-menu":
      return simpleRecipe(id, kind, "menu", ["resume", "settings", "quit"], options);
    case "item-detail-panel":
      return simpleRecipe(id, kind, "overlay", ["title", "description", "use"], options);
    case "dialog-box":
      return simpleRecipe(id, kind, "dialog", ["message", "confirm", "cancel"], options);
    case "notification-toast":
      return simpleRecipe(id, kind, "overlay", ["message"], options);
    case "loading-overlay":
      return simpleRecipe(id, kind, "loading", ["message", "progress"], options);
  }
}

export function validateUiWidgetSupport(options: { unsupported?: IUnsupportedUiWidgetOptions } = {}): void {
  if (options.unsupported?.virtualKeyboard === true) {
    throw new SdkError(
      "TN_SDK_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED",
      "Virtual keyboard widgets are not part of the V9 retained UI widget set.",
    );
  }
}

function inventoryGridRecipe(id: string, options: IUiRecipeOptions): IUiRecipeSource {
  const itemCount = Number(options.props?.items ?? 8);
  const visibleItemCount = Math.max(1, Math.min(32, Number.isFinite(itemCount) ? Math.trunc(itemCount) : 8));
  const totalItemCount = Math.max(visibleItemCount, Number.isFinite(itemCount) ? Math.trunc(itemCount) : visibleItemCount);
  const slots = Array.from({ length: visibleItemCount }, (_, index) => ({
    id: `${id}.slot.${index + 1}`,
    label: `Slot ${index + 1}`,
    type: "button",
    action: options.actions?.inspect ?? "inventory.inspect",
    layout: { width: 96, height: 96 },
  }));
  const root = {
    id,
    type: "column",
    label: "Inventory",
    layout: { anchor: "center", padding: 16 },
    responsive: responsiveRules({ desktop: { width: 640 }, mobile: { width: 320 }, tablet: { width: 520 } }),
    ...(totalItemCount > visibleItemCount ? { virtualRange: { buffer: 2, itemCount: totalItemCount, itemExtent: 104, orientation: "vertical", viewportExtent: 416 } } : {}),
  };
  return {
    bindings: bindingRows(id, options),
    components: [{ id: `${id}.slot`, props: [{ id: "label", required: true }], root: { id: "root", kind: "button", label: "$props.label" } }],
    focusOrder: slots.map((slot) => slot.id),
    nodes: [root, ...slots],
    provenance: recipeProvenance(id, "inventory-grid"),
    screens: [screen(id, "menu", id, options.actions?.back ?? "ui.back", "keyboard", slots[0]?.id ?? id)],
  };
}

function settingsListRecipe(id: string, options: IUiRecipeOptions): IUiRecipeSource {
  const rows = ["audio", "video", "controls"].map((name) => ({
    id: `${id}.${name}`,
    label: `${capitalize(name)} settings`,
    type: "button",
    action: options.actions?.[name] ?? `settings.${name}`,
  }));
  return {
    bindings: bindingRows(id, options),
    components: [],
    focusOrder: rows.map((row) => row.id),
    nodes: [
      {
        id,
        type: "column",
        label: "Settings",
        layout: { anchor: "center", padding: 16, width: 360 },
        responsive: responsiveRules({ desktop: { width: 420 }, mobile: { width: 320 }, tablet: { width: 380 } }),
      },
      ...rows,
    ],
    provenance: recipeProvenance(id, "settings-list"),
    screens: [screen(id, "menu", id, options.actions?.back ?? "ui.back", "keyboard", rows[0]?.id ?? id)],
  };
}

function attachedUiRecipe(id: string, kind: UiRecipeKind, options: IUiRecipeOptions): IUiRecipeSource {
  const targetId = String(options.props?.targetId ?? options.props?.entityId ?? "target");
  const attachTo = {
    target: { kind: "entity", id: targetId },
    anchor: "top-center",
    localOffset: [0, 1.4, 0],
    ...(kind === "off-screen-indicator" ? { clamp: "screenEdge" } : {}),
  };
  const action = options.actions?.interact ?? options.actions?.select ?? `${id}.select`;
  const value = typeof options.props?.value === "number" ? options.props.value : kind === "enemy-health-bar" ? 1 : undefined;
  const child =
    kind === "enemy-health-bar"
      ? { id: `${id}.bar`, type: "bar", label: "Health", value: value ?? 1, layout: { width: 96, height: 8 } }
      : { id: `${id}.label`, type: kind === "interact-prompt" ? "button" : "text", label: recipeLabel(kind), text: String(options.props?.label ?? recipeLabel(kind)), action };
  const root = {
    id,
    type: "column",
    label: recipeLabel(kind),
    attachTo,
    layout: { anchor: "center", padding: 6 },
  };
  return {
    bindings: bindingRows(id, options),
    components: [],
    focusOrder: kind === "interact-prompt" ? [`${id}.label`] : [],
    nodes: [root, child],
    provenance: recipeProvenance(id, kind),
    screens: [screen(id, "hud", id, options.actions?.back ?? "ui.back", "none", `${id}.label`)],
  };
}

function simpleRecipe(id: string, kind: UiRecipeKind, role: string, childIds: string[], options: IUiRecipeOptions): IUiRecipeSource {
  const nodes = [
    { id, type: "column", label: recipeLabel(kind), layout: { anchor: role === "hud" ? "top-left" : "center", padding: 12 } },
    ...childIds.map((child) => ({ id: `${id}.${child}`, type: child === "progress" ? "bar" : "button", label: recipeLabel(child), action: options.actions?.[child] ?? `${id}.${child}` })),
  ];
  return {
    bindings: bindingRows(id, options),
    components: [],
    focusOrder: nodes.slice(1).map((node) => String((node as { id: string }).id)),
    nodes,
    provenance: recipeProvenance(id, kind),
    screens: [screen(id, role, id, options.actions?.back ?? "ui.back", role === "hud" ? "none" : "keyboard", `${id}.${childIds[0] ?? "root"}`)],
  };
}

function bindingRows(id: string, options: IUiRecipeOptions): Array<{ node: string; resource: string }> {
  return Object.entries(options.bindings ?? {}).map(([node, resource]) => ({ node: node.includes(".") ? node : `${id}.${node}`, resource }));
}

function screen(id: string, role: string, root: string, backAction: string, inputCapture: string, entry: string): unknown {
  return { id, role, root, stackPolicy: role === "hud" ? "overlay" : "push", focusScope: { entry, backAction, inputCapture, restore: "previous" } };
}

function recipeProvenance(id: string, kind: UiRecipeKind): Record<string, unknown> {
  return { [`recipes/${id}`]: { kind, source: "sdk.uiRecipe", version: 1 } };
}

function responsiveRules(layouts: Record<UiRecipeTargetClass, Record<string, unknown>>): Array<{ layout: Record<string, unknown>; target: UiRecipeTargetClass }> {
  return (["desktop", "mobile", "tablet"] as const).map((target) => ({ target, layout: layouts[target] }));
}

function recipeLabel(value: string): string {
  return value.split("-").map(capitalize).join(" ");
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}
