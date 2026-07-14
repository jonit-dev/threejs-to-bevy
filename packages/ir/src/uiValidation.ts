import type { IUiComponentDefinitionIr, IUiFocusScopeIr, IUiIr, IUiNodeIr, IUiThemeTokenIr } from "./types.js";
import { validateUiGradient, validateUiShadow, validateUiTheme, validateUiTokenRefs } from "./uiThemeValidation.js";
import type { IIrDiagnostic } from "./validate.js";
import { validateUnsupportedFields } from "./validationDiagnostics.js";
import { isRecord } from "./validationPrimitives.js";

export function validateUi(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[], entityIds = new Set<string>()): void {
  if (ui.schema !== "threenative.ui" || ui.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_UI_VERSION_UNSUPPORTED",
      message: "UI IR must use threenative.ui version 0.1.0.",
      path,
    });
  }
  const ids = new Set<string>();
  const focusableIds = new Set<string>();
  const fontFamilies = validateUiFonts(ui, path, diagnostics);
  const themeTokens = validateUiTheme(ui, path, diagnostics);
  const components = validateUiComponents(ui, path, diagnostics, fontFamilies, themeTokens, entityIds);
  validateUiNode(ui.root, `${path}/root`, diagnostics, ids, fontFamilies, themeTokens, components, entityIds);
  validateUiGeneratedComponentIds(ui.root, `${path}/root`, diagnostics, ids, components);
  collectFocusableUiIds(ui.root, focusableIds);
  validateUiMetadata(ui, path, diagnostics, ids, focusableIds);
}
function validateUiNode(
  node: IUiNodeIr,
  path: string,
  diagnostics: IIrDiagnostic[],
  ids: Set<string>,
  fontFamilies: Set<string>,
  themeTokens: Map<string, IUiThemeTokenIr>,
  components: Map<string, IUiComponentDefinitionIr>,
  entityIds: Set<string>,
): void {
  const raw = node as unknown as Record<string, unknown>;
  validateUnsupportedFields(
    diagnostics,
    raw,
    ["accessibilityLabel", "action", "anchorId", "attachTo", "binding", "children", "component", "disabled", "effects", "feedback", "focusable", "glyph", "id", "image", "kind", "label", "layout", "localization", "max", "min", "minimap", "navigation", "orientation", "progress", "responsive", "role", "spans", "src", "step", "style", "text", "tokenRefs", "tooltip", "value", "valueText", "virtualRange"],
    (key) => ({
      code: "TN_IR_UI_FIELD_UNSUPPORTED",
      message: `UI node '${node.id}' uses unsupported field '${key}'.`,
      path: `${path}/${key}`,
    }),
  );
  validateUnsupportedUiRequests(raw, path, diagnostics);
  validateUiLayout(node.layout, `${path}/layout`, diagnostics);
  validateUiResponsiveRules(node, `${path}/responsive`, diagnostics, fontFamilies);
  validateUiVirtualRange(node, path, diagnostics);
  validateUiAttachment(node, path, diagnostics, entityIds);
  validateUiEffects(node, path, diagnostics);
  validateUiAffordances(node, path, diagnostics);
  validateUiBinding(node, path, diagnostics);
  validateUiStyle(node.style, `${path}/style`, diagnostics, fontFamilies);
  validateUiTokenRefs(node.tokenRefs, `${path}/tokenRefs`, diagnostics, themeTokens);
  validateUiSpans(node, path, diagnostics, fontFamilies);
  validateUiImageMetadata(node, path, diagnostics);
  if (node.kind === "minimap") {
    validateUiMinimapMetadata(node, path, diagnostics);
  }
  validateUiWidget(node, path, diagnostics);
  validateUiAccessibility(node, path, diagnostics);
  if (!["bar", "button", "column", "component", "contextMenu", "image", "minimap", "row", "scrollbar", "slider", "stack", "text", "textInput", "touchControl"].includes(node.kind)) {
    diagnostics.push({
      code: "TN_IR_UI_NODE_UNSUPPORTED",
      message: `Unsupported UI node kind '${String(node.kind)}'.`,
      path: `${path}/kind`,
    });
  }
  validateUiComponentInstance(node, path, diagnostics, components);
  if (ids.has(node.id)) {
    diagnostics.push({
      code: "TN_IR_UI_ID_DUPLICATE",
      message: `UI node ID '${node.id}' is duplicated.`,
      path: `${path}/id`,
    });
  }
  ids.add(node.id);
  if ((node.kind === "button" || node.kind === "touchControl") && node.action === undefined) {
    diagnostics.push({
      code: "TN_IR_UI_ACTION_MISSING",
      message: `UI ${node.kind} node '${node.id}' must declare an action.`,
      path: `${path}/action`,
    });
  }
  if (node.kind === "image") {
    if (typeof node.src !== "string" || node.src.length === 0) {
      diagnostics.push({
        code: "TN_IR_UI_IMAGE_SRC_MISSING",
        message: `UI image node '${node.id}' must declare a non-empty src.`,
        path: `${path}/src`,
      });
    } else if (node.src.startsWith("/") || node.src.includes("..") || /^[a-z]+:/i.test(node.src)) {
      diagnostics.push({
        code: "TN_IR_UI_IMAGE_SRC_INVALID",
        message: "UI image src must be a bundle-relative path.",
        path: `${path}/src`,
      });
    }
  }
  if (raw.virtualKeyboard !== undefined) {
    diagnostics.push({
      code: "TN_IR_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED",
      message: "Virtual keyboard widgets are deferred from the V9 retained UI widget set.",
      path: `${path}/virtualKeyboard`,
      severity: "error",
      suggestion: "Use slider, scrollbar, or contextMenu widgets in V9; defer virtual keyboard UI until mobile packaging is promoted.",
    });
  }
  node.children?.forEach((child, index) => validateUiNode(child, `${path}/children/${index}`, diagnostics, ids, fontFamilies, themeTokens, components, entityIds));
}

function validateUiBinding(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const binding = node.binding;
  if (binding === undefined) {
    return;
  }
  if (!isRecord(binding)) {
    diagnostics.push({ code: "TN_IR_UI_BINDING_INVALID", message: `UI node '${node.id}' binding must be an object.`, path: `${path}/binding`, severity: "error" });
    return;
  }
  const allowed = binding.kind === "resource"
    ? ["field", "fields", "format", "kind", "name"]
    : binding.kind === "component"
      ? ["component", "entity", "field", "fields", "format", "kind"]
      : [];
  if (allowed.length === 0) {
    diagnostics.push({ code: "TN_IR_UI_BINDING_INVALID", message: `UI node '${node.id}' binding kind must be resource or component.`, path: `${path}/binding/kind`, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, binding, allowed, (key) => ({
    code: "TN_IR_UI_BINDING_FIELD_UNSUPPORTED",
    message: `UI node '${node.id}' binding uses unsupported field '${key}'.`,
    path: `${path}/binding/${key}`,
    severity: "error",
  }));
  if (binding.kind === "resource" && (typeof binding.name !== "string" || binding.name.trim() === "")) {
    diagnostics.push({ code: "TN_IR_UI_BINDING_INVALID", message: `UI node '${node.id}' resource binding requires a non-empty name.`, path: `${path}/binding/name`, severity: "error" });
  }
  if (binding.kind === "component") {
    if (typeof binding.entity !== "string" || binding.entity.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_BINDING_INVALID", message: `UI node '${node.id}' component binding requires a non-empty entity.`, path: `${path}/binding/entity`, severity: "error" });
    }
    if (typeof binding.component !== "string" || binding.component.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_BINDING_INVALID", message: `UI node '${node.id}' component binding requires a non-empty component.`, path: `${path}/binding/component`, severity: "error" });
    }
  }
  if (binding.field !== undefined && (typeof binding.field !== "string" || binding.field.trim() === "")) {
    diagnostics.push({ code: "TN_IR_UI_BINDING_FIELD_INVALID", message: "UI binding field must be a non-empty string.", path: `${path}/binding/field`, severity: "error" });
  }
  const fields = binding.fields;
  if (fields !== undefined && (!Array.isArray(fields) || fields.length === 0 || fields.some((field) => typeof field !== "string" || field.trim() === ""))) {
    diagnostics.push({ code: "TN_IR_UI_BINDING_FIELDS_INVALID", message: "UI binding fields must be a non-empty array of field names.", path: `${path}/binding/fields`, severity: "error" });
  }
  validateUiBindingFormat(binding.format, `${path}/binding/format`, fields ?? (typeof binding.field === "string" ? [binding.field] : []), diagnostics);
}

function validateUiBindingFormat(value: unknown, path: string, fields: readonly string[], diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({ code: "TN_IR_UI_BINDING_FORMAT_INVALID", message: "UI binding format must be a non-empty string.", path, severity: "error" });
    return;
  }
  const placeholders = [...value.matchAll(/\{([^{}]+)\}/g)];
  if (placeholders.length === 0) {
    diagnostics.push({ code: "TN_IR_UI_BINDING_FORMAT_INVALID", message: "UI binding format must include at least one placeholder.", path, severity: "error" });
    return;
  }
  for (const match of placeholders) {
    const token = match[1] ?? "";
    const [field, formatter, extra] = token.split(":");
    if (extra !== undefined || field === undefined || field.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_BINDING_FORMAT_INVALID", message: "UI binding placeholders must use {field} or {field:fixed1} syntax.", path, severity: "error" });
      continue;
    }
    if (fields.length > 0 && !fields.includes(field)) {
      diagnostics.push({
        code: "TN_IR_UI_BINDING_FORMAT_FIELD_MISSING",
        message: `UI binding format references field '${field}' that is not listed in binding.fields.`,
        path,
        severity: "error",
      });
    }
    if (formatter !== undefined && !/^fixed\d$/.test(formatter) && !/^pad\d+$/.test(formatter)) {
      diagnostics.push({
        code: "TN_IR_UI_BINDING_FORMAT_INVALID",
        message: "UI binding format supports only fixed<n> and pad<n> formatters.",
        path,
        severity: "error",
      });
    }
  }
}

function validateUnsupportedUiRequests(raw: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (raw.transform !== undefined || raw.transforms !== undefined) {
    diagnostics.push({
      code: "TN_IR_UI_TRANSFORM_UNSUPPORTED",
      message: "Broad retained UI transforms are not supported in the V9 portable UI contract.",
      path: `${path}/${raw.transform !== undefined ? "transform" : "transforms"}`,
      severity: "error",
      suggestion: "Use promoted layout positioning fields until portable UI transforms are promoted.",
    });
  }
  if (raw.renderTarget !== undefined || raw.renderToTexture !== undefined) {
    diagnostics.push({
      code: "TN_IR_UI_RENDER_TO_TEXTURE_UNSUPPORTED",
      message: "Render-to-texture UI is not supported in the V9 portable UI contract.",
      path: `${path}/${raw.renderTarget !== undefined ? "renderTarget" : "renderToTexture"}`,
      severity: "error",
      suggestion: "Render retained UI through the promoted web DOM or native UI adapters.",
    });
  }
  if (raw.worldSpace !== undefined || raw.worldUi !== undefined || raw.spatial !== undefined) {
    diagnostics.push({
      code: "TN_IR_UI_WORLD_SPACE_UNSUPPORTED",
      message: "3D-world UI is not supported in the V9 portable UI contract.",
      path: `${path}/${raw.worldSpace !== undefined ? "worldSpace" : raw.worldUi !== undefined ? "worldUi" : "spatial"}`,
      severity: "error",
      suggestion: "Use screen-space retained UI and promoted picking metadata until 3D-world UI is promoted.",
    });
  }
}


function validateUiMinimapMetadata(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (node.minimap === undefined) {
    diagnostics.push({ code: "TN_UI_MINIMAP_METADATA_MISSING", message: "Minimap nodes require minimap metadata.", path, severity: "error" });
    return;
  }
  const { bounds, paths, markers } = node.minimap;
  if (bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) {
    diagnostics.push({ code: "TN_UI_MINIMAP_BOUNDS_INVALID", message: "Minimap bounds must have positive width and height.", path: `${path}/minimap/bounds`, severity: "error" });
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    diagnostics.push({ code: "TN_UI_MINIMAP_PATHS_EMPTY", message: "Minimap requires at least one path.", path: `${path}/minimap/paths`, severity: "error" });
  }
  for (const [pathIndex, item] of paths.entries()) {
    if (!Array.isArray(item.points) || item.points.length < 2) {
      diagnostics.push({ code: "TN_UI_MINIMAP_PATH_TOO_SHORT", message: "Minimap paths must contain at least two points.", path: `${path}/minimap/paths/${pathIndex}/points`, severity: "error" });
    }
    for (const [pointIndex, point] of item.points.entries()) {
      if (!Array.isArray(point) || point.length !== 2 || point.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
        diagnostics.push({ code: "TN_UI_MINIMAP_POINT_INVALID", message: "Minimap path points must be finite [x, z] tuples.", path: `${path}/minimap/paths/${pathIndex}/points/${pointIndex}`, severity: "error" });
      }
    }
  }
  for (const [markerIndex, marker] of (markers ?? []).entries()) {
    if (![marker.x, marker.z].every((value) => typeof value === "number" && Number.isFinite(value))) {
      diagnostics.push({ code: "TN_UI_MINIMAP_MARKER_INVALID", message: "Minimap markers must have finite x/z coordinates.", path: `${path}/minimap/markers/${markerIndex}`, severity: "error" });
    }
  }
}

function validateUiImageMetadata(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const image = node.image;
  if (image === undefined) {
    return;
  }
  if (node.kind !== "image") {
    diagnostics.push({ code: "TN_IR_UI_IMAGE_METADATA_INVALID", message: "UI image metadata is only supported on image nodes.", path: `${path}/image` });
  }
  if (image.scaleMode !== undefined && !["contain", "cover", "stretch"].includes(image.scaleMode)) {
    diagnostics.push({ code: "TN_IR_UI_IMAGE_SCALE_MODE_INVALID", message: "UI image scaleMode must be contain, cover, or stretch.", path: `${path}/image/scaleMode` });
  }
  if (image.tint !== undefined && !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(image.tint)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: "UI image tint must be #RRGGBB or #RRGGBBAA.", path: `${path}/image/tint` });
  }
  validatePositiveSize(image.sourceSize, `${path}/image/sourceSize`, diagnostics);
  validatePositiveSize(image.tileSize, `${path}/image/tileSize`, diagnostics);
  validateImageRect(image.atlas, image.sourceSize, `${path}/image/atlas`, diagnostics);
  validateNineSlice(image.nineSlice, image.sourceSize, `${path}/image/nineSlice`, diagnostics);
  if (image.nineSlice !== undefined && image.tileSize !== undefined) {
    diagnostics.push({
      code: "TN_IR_UI_IMAGE_MODE_INCOMPATIBLE",
      message: "UI image nineSlice and tileSize cannot be combined in the V9 portable image metadata.",
      path: `${path}/image`,
      suggestion: "Use nineSlice for panel scaling or tileSize for repeated textures, not both.",
    });
  }
}

function validateUiWidget(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (node.kind !== "slider" && node.kind !== "scrollbar" && node.kind !== "contextMenu" && node.kind !== "textInput") {
    return;
  }
  if (node.kind === "slider" || node.kind === "scrollbar") {
    const min = node.min ?? 0;
    const max = node.max ?? 1;
    const value = node.value ?? min;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      diagnostics.push({ code: "TN_IR_UI_WIDGET_RANGE_INVALID", message: "UI slider/scrollbar min must be less than max.", path });
    }
    if (!Number.isFinite(value) || value < min || value > max) {
      diagnostics.push({ code: "TN_IR_UI_WIDGET_VALUE_INVALID", message: "UI slider/scrollbar value must be inside min/max.", path: `${path}/value` });
    }
    if (node.step !== undefined && (!Number.isFinite(node.step) || node.step <= 0)) {
      diagnostics.push({ code: "TN_IR_UI_WIDGET_STEP_INVALID", message: "UI slider/scrollbar step must be a finite positive number.", path: `${path}/step` });
    }
    if (node.orientation !== undefined && node.orientation !== "horizontal" && node.orientation !== "vertical") {
      diagnostics.push({ code: "TN_IR_UI_WIDGET_ORIENTATION_INVALID", message: "UI slider/scrollbar orientation must be horizontal or vertical.", path: `${path}/orientation` });
    }
    if (node.kind === "slider" && node.action === undefined) {
      diagnostics.push({ code: "TN_IR_UI_WIDGET_ACTION_MISSING", message: "UI slider must declare an action for portable value-change events.", path: `${path}/action` });
    }
  }
  if (node.kind === "contextMenu") {
    const children = node.children ?? [];
    children.forEach((child, index) => {
      if (child.kind !== "button") {
        diagnostics.push({ code: "TN_IR_UI_CONTEXT_MENU_ITEM_INVALID", message: "UI contextMenu children must be button items.", path: `${path}/children/${index}/kind` });
      }
    });
  }
  if (node.kind === "textInput" && node.action === undefined) {
    diagnostics.push({ code: "TN_IR_UI_WIDGET_ACTION_MISSING", message: "UI textInput must declare an action for portable value-change events.", path: `${path}/action` });
  }
}

function validatePositiveSize(value: { width: number; height: number } | undefined, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) {
    diagnostics.push({ code: "TN_IR_UI_IMAGE_SIZE_INVALID", message: "UI image dimensions must be finite positive numbers.", path });
  }
}

function validateImageRect(
  rect: { x: number; y: number; width: number; height: number } | undefined,
  sourceSize: { width: number; height: number } | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (rect === undefined) {
    return;
  }
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) {
    diagnostics.push({ code: "TN_IR_UI_IMAGE_ATLAS_INVALID", message: "UI image atlas rect must use finite non-negative origin and positive dimensions.", path });
    return;
  }
  if (sourceSize !== undefined && (rect.x + rect.width > sourceSize.width || rect.y + rect.height > sourceSize.height)) {
    diagnostics.push({
      code: "TN_IR_UI_IMAGE_ATLAS_BOUNDS_INVALID",
      message: "UI image atlas rect must fit inside sourceSize.",
      path,
      suggestion: "Adjust atlas x/y/width/height or update image.sourceSize to match the source texture.",
    });
  }
}

function validateNineSlice(
  slice: { left: number; right: number; top: number; bottom: number } | undefined,
  sourceSize: { width: number; height: number } | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (slice === undefined) {
    return;
  }
  if (![slice.left, slice.right, slice.top, slice.bottom].every(Number.isFinite) || slice.left < 0 || slice.right < 0 || slice.top < 0 || slice.bottom < 0) {
    diagnostics.push({ code: "TN_IR_UI_IMAGE_NINE_SLICE_INVALID", message: "UI image nineSlice insets must be finite non-negative numbers.", path });
    return;
  }
  if (sourceSize !== undefined && (slice.left + slice.right >= sourceSize.width || slice.top + slice.bottom >= sourceSize.height)) {
    diagnostics.push({
      code: "TN_IR_UI_IMAGE_NINE_SLICE_BOUNDS_INVALID",
      message: "UI image nineSlice insets must fit inside sourceSize without overlapping.",
      path,
      suggestion: "Reduce nineSlice insets or provide the correct sourceSize.",
    });
  }
}

function validateUiFonts(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const families = new Set<string>();
  ui.fonts?.forEach((font, index) => {
    const fontPath = `${path}/fonts/${index}`;
    if (font.family.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_FONT_FAMILY_INVALID", message: "UI font family must not be empty.", path: `${fontPath}/family`, suggestion: "Use a stable family id such as 'body'." });
    }
    if (families.has(font.family)) {
      diagnostics.push({ code: "TN_IR_UI_FONT_DUPLICATE", message: `UI font family '${font.family}' is declared more than once.`, path: `${fontPath}/family`, suggestion: "Keep one font declaration per family id." });
    }
    families.add(font.family);
    if (font.asset.trim() === "" || font.asset.startsWith("/") || font.asset.includes("..") || /^[a-z]+:/i.test(font.asset)) {
      diagnostics.push({ code: "TN_IR_UI_FONT_ASSET_INVALID", message: "UI font asset must be a bundle-relative path.", path: `${fontPath}/asset`, suggestion: "Store the font inside the bundle and reference it with a relative path such as 'assets/fonts/body.ttf'." });
    }
    if (font.weight !== undefined && !(font.weight === "normal" || font.weight === "bold" || typeof font.weight === "number" && Number.isInteger(font.weight) && font.weight >= 100 && font.weight <= 900)) {
      diagnostics.push({ code: "TN_IR_UI_FONT_WEIGHT_INVALID", message: "UI font weight must be normal, bold, or an integer from 100 to 900.", path: `${fontPath}/weight`, suggestion: "Use 'normal', 'bold', or a CSS-compatible numeric weight." });
    }
    font.glyphRanges?.forEach((range, rangeIndex) => {
      if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 || range.to < range.from) {
        diagnostics.push({ code: "TN_IR_UI_FONT_GLYPH_RANGE_INVALID", message: "UI font glyph range must use non-negative integer code points with from <= to.", path: `${fontPath}/glyphRanges/${rangeIndex}`, suggestion: "Use inclusive Unicode code point ranges such as { from: 32, to: 126 }." });
      }
    });
  });
  return families;
}

function validateUiComponents(
  ui: IUiIr,
  path: string,
  diagnostics: IIrDiagnostic[],
  fontFamilies: Set<string>,
  themeTokens: Map<string, IUiThemeTokenIr>,
  entityIds: Set<string>,
): Map<string, IUiComponentDefinitionIr> {
  const components = new Map<string, IUiComponentDefinitionIr>();
  if (ui.components === undefined) {
    return components;
  }
  ui.components.forEach((component, index) => {
    const componentPath = `${path}/components/${index}`;
    if (typeof component.id !== "string" || component.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_COMPONENT_ID_INVALID", message: "UI component id must be a non-empty string.", path: `${componentPath}/id` });
      return;
    }
    if (components.has(component.id)) {
      diagnostics.push({ code: "TN_IR_UI_COMPONENT_DUPLICATE", message: `UI component '${component.id}' is duplicated.`, path: `${componentPath}/id` });
    }
    components.set(component.id, component);
    const props = new Set<string>();
    component.props?.forEach((prop, propIndex) => {
      if (typeof prop.id !== "string" || prop.id.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_COMPONENT_PROP_INVALID", message: "UI component prop id must be a non-empty string.", path: `${componentPath}/props/${propIndex}/id` });
      } else if (props.has(prop.id)) {
        diagnostics.push({ code: "TN_IR_UI_COMPONENT_PROP_DUPLICATE", message: `UI component prop '${prop.id}' is duplicated.`, path: `${componentPath}/props/${propIndex}/id` });
      }
      props.add(String(prop.id));
    });
    const templateIds = new Set<string>();
    validateUiNode(component.root, `${componentPath}/root`, diagnostics, templateIds, fontFamilies, themeTokens, components, entityIds);
  });
  for (const component of ui.components) {
    validateUiComponentCycles(component, components, [], `${path}/components`);
  }
  return components;

  function validateUiComponentCycles(component: IUiComponentDefinitionIr, all: Map<string, IUiComponentDefinitionIr>, stack: string[], componentPath: string): void {
    if (stack.includes(component.id)) {
      const cycle = [...stack.slice(stack.indexOf(component.id)), component.id];
      diagnostics.push({
        code: "TN_IR_UI_COMPONENT_CYCLE",
        message: `UI component cycle detected: ${cycle.join(" -> ")}.`,
        path: componentPath,
        severity: "error",
        suggestion: "Remove the recursive component reference or replace one edge with a slot filled by the caller.",
      });
      return;
    }
    for (const ref of collectComponentRefs(component.root)) {
      const target = all.get(ref);
      if (target !== undefined) {
        validateUiComponentCycles(target, all, [...stack, component.id], componentPath);
      }
    }
  }
}

function collectComponentRefs(node: IUiNodeIr): string[] {
  return [
    ...(node.kind === "component" && node.component?.ref !== undefined ? [node.component.ref] : []),
    ...(node.children ?? []).flatMap(collectComponentRefs),
    ...Object.values(node.component?.slots ?? {}).flatMap((slot) => slot.flatMap(collectComponentRefs)),
  ];
}

function validateUiComponentInstance(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], components: Map<string, IUiComponentDefinitionIr>): void {
  if (node.kind !== "component") {
    if (node.component !== undefined) {
      diagnostics.push({ code: "TN_IR_UI_COMPONENT_INSTANCE_INVALID", message: "UI component metadata is only supported on component nodes.", path: `${path}/component` });
    }
    return;
  }
  if (node.component === undefined) {
    diagnostics.push({ code: "TN_IR_UI_COMPONENT_REF_MISSING", message: "UI component nodes must declare component metadata.", path: `${path}/component` });
    return;
  }
  const component = components.get(node.component.ref);
  if (component === undefined) {
    diagnostics.push({ code: "TN_IR_UI_COMPONENT_REF_UNRESOLVED", message: `UI component node '${node.id}' references missing component '${node.component.ref}'.`, path: `${path}/component/ref` });
    return;
  }
  const props = node.component.props ?? {};
  const declaredProps = new Map((component.props ?? []).map((prop) => [prop.id, prop]));
  for (const [propId, prop] of declaredProps) {
    if (prop.required === true && props[propId] === undefined && prop.defaultValue === undefined) {
      diagnostics.push({ code: "TN_IR_UI_COMPONENT_PROP_MISSING", message: `UI component '${component.id}' requires prop '${propId}'.`, path: `${path}/component/props/${propId}` });
    }
  }
  for (const propId of Object.keys(props)) {
    if (!declaredProps.has(propId)) {
      diagnostics.push({ code: "TN_IR_UI_COMPONENT_PROP_UNDECLARED", message: `UI component '${component.id}' does not declare prop '${propId}'.`, path: `${path}/component/props/${propId}` });
    }
  }
  const declaredSlots = new Set(component.slots ?? []);
  for (const [slotId, children] of Object.entries(node.component.slots ?? {})) {
    if (!declaredSlots.has(slotId)) {
      diagnostics.push({ code: "TN_IR_UI_COMPONENT_SLOT_UNDECLARED", message: `UI component '${component.id}' does not declare slot '${slotId}'.`, path: `${path}/component/slots/${slotId}` });
    }
    children.forEach((child, index) => validateUiNode(child, `${path}/component/slots/${slotId}/${index}`, diagnostics, new Set<string>(), new Set<string>(), new Map<string, IUiThemeTokenIr>(), components, new Set<string>()));
  }
}

function validateUiGeneratedComponentIds(
  node: IUiNodeIr,
  path: string,
  diagnostics: IIrDiagnostic[],
  sourceIds: Set<string>,
  components: Map<string, IUiComponentDefinitionIr>,
): void {
  if (node.kind === "component" && node.component !== undefined) {
    const component = components.get(node.component.ref);
    if (component !== undefined) {
      const generatedIds = new Set<string>();
      collectGeneratedComponentIds(component.root, node.id, `${path}/component`, diagnostics, generatedIds, sourceIds);
    }
  }
  node.children?.forEach((child, index) => validateUiGeneratedComponentIds(child, `${path}/children/${index}`, diagnostics, sourceIds, components));
}

function collectGeneratedComponentIds(
  node: IUiNodeIr,
  instanceId: string,
  path: string,
  diagnostics: IIrDiagnostic[],
  generatedIds: Set<string>,
  sourceIds: Set<string>,
): void {
  const generatedId = `${instanceId}.${node.id}`;
  if (generatedIds.has(generatedId) || sourceIds.has(generatedId)) {
    diagnostics.push({
      code: "TN_IR_UI_COMPONENT_GENERATED_ID_DUPLICATE",
      message: `UI component generated node ID '${generatedId}' collides with an existing node ID.`,
      path: `${path}/root/id`,
    });
  }
  generatedIds.add(generatedId);
  node.children?.forEach((child, index) => collectGeneratedComponentIds(child, instanceId, `${path}/root/children/${index}`, diagnostics, generatedIds, sourceIds));
}

function validateUiSpans(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], fontFamilies: Set<string>): void {
  if (node.spans === undefined) {
    return;
  }
  if (node.kind !== "text") {
    diagnostics.push({ code: "TN_IR_UI_RICH_TEXT_NODE_INVALID", message: "Rich text spans are only supported on text nodes.", path: `${path}/spans`, suggestion: "Move spans to a text node or use plain children for layout." });
  }
  if (node.spans.length === 0) {
    diagnostics.push({ code: "TN_IR_UI_RICH_TEXT_EMPTY", message: "Rich text spans must not be empty.", path: `${path}/spans`, suggestion: "Remove spans or add at least one text span." });
  }
  node.spans.forEach((span, index) => {
    const spanPath = `${path}/spans/${index}`;
    if (span.text.length === 0) {
      diagnostics.push({ code: "TN_IR_UI_RICH_TEXT_SPAN_EMPTY", message: "Rich text span text must not be empty.", path: `${spanPath}/text`, suggestion: "Remove empty spans or provide visible text." });
    }
    if (span.fontFamily !== undefined && !fontFamilies.has(span.fontFamily)) {
      diagnostics.push({ code: "TN_IR_UI_FONT_MISSING", message: `Rich text span references missing font family '${span.fontFamily}'.`, path: `${spanPath}/fontFamily`, suggestion: `Declare ui.fonts with family '${span.fontFamily}' and a bundle-relative asset path.` });
    }
    if (span.color !== undefined && !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(span.color)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: "Rich text span color must be #RRGGBB or #RRGGBBAA.", path: `${spanPath}/color` });
    }
    if (span.fontSize !== undefined && (!Number.isFinite(span.fontSize) || span.fontSize <= 0)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: "Rich text span fontSize must be a finite positive number.", path: `${spanPath}/fontSize` });
    }
    if (span.weight !== undefined && !(span.weight === "normal" || span.weight === "bold" || typeof span.weight === "number" && Number.isInteger(span.weight) && span.weight >= 100 && span.weight <= 900)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_FONT_WEIGHT_INVALID", message: "Rich text span weight must be normal, bold, or an integer from 100 to 900.", path: `${spanPath}/weight` });
    }
    if (span.decoration !== undefined && !["lineThrough", "none", "underline"].includes(span.decoration)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_TEXT_DECORATION_INVALID", message: "Rich text span decoration must be none, underline, or lineThrough.", path: `${spanPath}/decoration` });
    }
    if (span.accessibilityText !== undefined && span.accessibilityText.length === 0) {
      diagnostics.push({ code: "TN_IR_UI_RICH_TEXT_ACCESSIBILITY_INVALID", message: "Rich text accessibilityText must not be empty.", path: `${spanPath}/accessibilityText`, suggestion: "Provide replacement accessible text or omit accessibilityText." });
    }
  });
}

function validateUiAccessibility(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (node.accessibilityLabel !== undefined && (typeof node.accessibilityLabel !== "string" || node.accessibilityLabel.length === 0)) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_LABEL_INVALID", message: "UI accessibilityLabel must be a non-empty string when provided.", path: `${path}/accessibilityLabel` });
  }
  if (node.role !== undefined && !["button", "group", "image", "list", "listitem", "none", "progressbar", "text"].includes(String(node.role))) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_ROLE_INVALID", message: "UI role must be button, group, image, list, listitem, none, progressbar, or text.", path: `${path}/role` });
  }
  const hasAccessibleName = typeof node.accessibilityLabel === "string" && node.accessibilityLabel.length > 0
    || typeof node.label === "string" && node.label.length > 0
    || typeof node.text === "string" && node.text.length > 0;
  if (["bar", "button", "image", "scrollbar", "slider", "textInput", "touchControl"].includes(node.kind) && !hasAccessibleName) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_LABEL_MISSING", message: `UI ${node.kind} node '${node.id}' must declare label, text, or accessibilityLabel.`, path });
  }
  if (node.focusable === true && !hasAccessibleName) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_FOCUSABLE_NAME_MISSING", message: `Focusable UI node '${node.id}' must declare label, text, or accessibilityLabel.`, path });
  }
  if ((node.role === "progressbar" || node.kind === "slider" || node.kind === "scrollbar") && !hasAccessibleName) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_PROGRESS_NAME_MISSING", message: `UI range node '${node.id}' must declare label, text, or accessibilityLabel.`, path });
  }
  if (node.role === "list") {
    node.children?.forEach((child, index) => {
      if (child.role !== "listitem") {
        diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_LISTITEM_MISSING", message: `UI list child '${child.id}' must declare role 'listitem'.`, path: `${path}/children/${index}/role` });
      }
    });
  }
}

function validateUiStyle(value: unknown, path: string, diagnostics: IIrDiagnostic[], fontFamilies: Set<string>): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_INVALID", message: "UI style must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["backgroundColor", "borderColor", "borderRadius", "borderWidth", "color", "fontFamily", "fontSize", "fontWeight", "gradient", "opacity", "shadow", "textAlign", "textDecoration", "wrap"].includes(key)) {
      if (["fontVariationSettings", "fontVariations", "fontStretch", "letterSpacing"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_UI_TYPOGRAPHY_UNSUPPORTED",
          message: `UI style typography field '${key}' is not part of the portable text contract.`,
          path: `${path}/${key}`,
          severity: "error",
          suggestion: "Use declared bundle font families plus promoted fontSize, fontWeight, textAlign, textDecoration, and wrap fields.",
        });
      } else {
        diagnostics.push({ code: "TN_IR_UI_STYLE_FIELD_UNSUPPORTED", message: `UI style uses unsupported field '${key}'.`, path: `${path}/${key}` });
      }
    }
  }
  if (value.fontFamily !== undefined) {
    if (typeof value.fontFamily !== "string" || value.fontFamily.length === 0) {
      diagnostics.push({ code: "TN_IR_UI_FONT_FAMILY_UNSUPPORTED", message: "UI style fontFamily must reference a declared bundle font family.", path: `${path}/fontFamily` });
    } else if (!fontFamilies.has(value.fontFamily)) {
      diagnostics.push({
        code: "TN_IR_UI_FONT_FAMILY_UNSUPPORTED",
        message: `UI style fontFamily '${value.fontFamily}' is not declared in ui.fonts.`,
        path: `${path}/fontFamily`,
        severity: "error",
        suggestion: `Declare ui.fonts with family '${value.fontFamily}' and a bundle-relative asset path; generic/system font families are not portable.`,
      });
    }
  }
  for (const key of ["backgroundColor", "borderColor", "color"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "string" || !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(item))) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: `UI style ${key} must be #RRGGBB or #RRGGBBAA.`, path: `${path}/${key}` });
    }
  }
  for (const key of ["borderRadius", "borderWidth", "fontSize"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: `UI style ${key} must be a finite non-negative number.`, path: `${path}/${key}` });
    }
  }
  if (value.opacity !== undefined && (typeof value.opacity !== "number" || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_OPACITY_INVALID", message: "UI style opacity must be between 0 and 1.", path: `${path}/opacity` });
  }
  validateUiGradient(value.gradient, `${path}/gradient`, diagnostics);
  validateUiShadow(value.shadow, `${path}/shadow`, diagnostics);
  if (value.fontWeight !== undefined && !["bold", "normal"].includes(String(value.fontWeight))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_FONT_WEIGHT_INVALID", message: "UI style fontWeight must be normal or bold.", path: `${path}/fontWeight` });
  }
  if (value.textAlign !== undefined && !["center", "left", "right"].includes(String(value.textAlign))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_TEXT_ALIGN_INVALID", message: "UI style textAlign must be left, center, or right.", path: `${path}/textAlign` });
  }
  if (value.textDecoration !== undefined && !["lineThrough", "none", "underline"].includes(String(value.textDecoration))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_TEXT_DECORATION_INVALID", message: "UI style textDecoration must be none, underline, or lineThrough.", path: `${path}/textDecoration` });
  }
  if (value.wrap !== undefined && !["character", "none", "word"].includes(String(value.wrap))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_WRAP_INVALID", message: "UI style wrap must be character, none, or word.", path: `${path}/wrap` });
  }
}

function validateUiLayout(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_INVALID", message: "UI layout must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["align", "columnGap", "direction", "grid", "grow", "height", "inset", "justify", "maxHeight", "maxWidth", "minHeight", "minWidth", "overflow", "padding", "position", "rowGap", "width", "zIndex"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_FIELD_UNSUPPORTED", message: `UI layout uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (value.direction !== undefined && !["column", "row"].includes(String(value.direction))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_DIRECTION_INVALID", message: "UI layout direction must be row or column.", path: `${path}/direction` });
  }
  if (value.align !== undefined && !["center", "end", "start", "stretch"].includes(String(value.align))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_ALIGN_INVALID", message: "UI layout align must be start, center, end, or stretch.", path: `${path}/align` });
  }
  if (value.justify !== undefined && !["center", "end", "spaceBetween", "start"].includes(String(value.justify))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_JUSTIFY_INVALID", message: "UI layout justify must be start, center, end, or spaceBetween.", path: `${path}/justify` });
  }
  if (value.overflow !== undefined && !["hidden", "scroll", "visible"].includes(String(value.overflow))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_OVERFLOW_INVALID", message: "UI layout overflow must be hidden, scroll, or visible.", path: `${path}/overflow` });
  }
  if (value.position !== undefined && !["absolute", "relative"].includes(String(value.position))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_POSITION_INVALID", message: "UI layout position must be absolute or relative.", path: `${path}/position` });
  }
  validateUiGridLayout(value.grid, `${path}/grid`, diagnostics);
  for (const key of ["columnGap", "grow", "height", "maxHeight", "maxWidth", "minHeight", "minWidth", "padding", "rowGap", "width"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_NUMBER_INVALID", message: `UI layout ${key} must be a finite non-negative number.`, path: `${path}/${key}` });
    }
  }
  if (value.inset !== undefined) {
    if (!isRecord(value.inset)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_INSET_INVALID", message: "UI layout inset must be an object.", path: `${path}/inset` });
    } else {
      for (const key of Object.keys(value.inset)) {
        if (!["bottom", "left", "right", "top"].includes(key)) {
          diagnostics.push({ code: "TN_IR_UI_LAYOUT_INSET_FIELD_UNSUPPORTED", message: `UI layout inset uses unsupported field '${key}'.`, path: `${path}/inset/${key}` });
        }
      }
      for (const key of ["bottom", "left", "right", "top"]) {
        const item = value.inset[key];
        if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
          diagnostics.push({ code: "TN_IR_UI_LAYOUT_INSET_INVALID", message: `UI layout inset ${key} must be a finite non-negative number.`, path: `${path}/inset/${key}` });
        }
      }
    }
  }
  if (value.zIndex !== undefined && (typeof value.zIndex !== "number" || !Number.isInteger(value.zIndex))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_Z_INDEX_INVALID", message: "UI layout zIndex must be an integer.", path: `${path}/zIndex` });
  }
}

function validateUiResponsiveRules(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], fontFamilies: Set<string>): void {
  if (node.responsive === undefined) {
    return;
  }
  if (!Array.isArray(node.responsive)) {
    diagnostics.push({ code: "TN_IR_UI_RESPONSIVE_INVALID", message: "UI responsive rules must be an array.", path });
    return;
  }
  const targets = new Set<string>();
  node.responsive.forEach((rule, index) => {
    const rulePath = `${path}/${index}`;
    if (!isRecord(rule)) {
      diagnostics.push({ code: "TN_IR_UI_RESPONSIVE_INVALID", message: "UI responsive rule must be an object.", path: rulePath });
      return;
    }
    for (const key of Object.keys(rule)) {
      if (!["layout", "style", "target"].includes(key)) {
        diagnostics.push({ code: "TN_IR_UI_RESPONSIVE_FIELD_UNSUPPORTED", message: `UI responsive rule uses unsupported field '${key}'.`, path: `${rulePath}/${key}` });
      }
    }
    if (!["desktop", "mobile", "tablet"].includes(String(rule.target))) {
      diagnostics.push({ code: "TN_IR_UI_RESPONSIVE_TARGET_INVALID", message: "UI responsive target must be desktop, mobile, or tablet.", path: `${rulePath}/target` });
    } else if (targets.has(String(rule.target))) {
      diagnostics.push({ code: "TN_IR_UI_RESPONSIVE_TARGET_DUPLICATE", message: `UI responsive target '${String(rule.target)}' is duplicated.`, path: `${rulePath}/target` });
    }
    targets.add(String(rule.target));
    validateUiLayout(rule.layout, `${rulePath}/layout`, diagnostics);
    validateUiStyle(rule.style, `${rulePath}/style`, diagnostics, fontFamilies);
  });
}

function validateUiVirtualRange(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const childCount = node.children?.length ?? 0;
  if (childCount > 100 && node.virtualRange === undefined) {
    diagnostics.push({
      code: "TN_IR_UI_VIRTUAL_RANGE_REQUIRED",
      message: `UI node '${node.id}' has ${childCount} children; add virtualRange metadata for large lists or grids.`,
      path: `${path}/virtualRange`,
    });
  }
  if (node.virtualRange === undefined) {
    return;
  }
  if (!isRecord(node.virtualRange)) {
    diagnostics.push({ code: "TN_IR_UI_VIRTUAL_RANGE_INVALID", message: "UI virtualRange must be an object.", path: `${path}/virtualRange` });
    return;
  }
  for (const key of Object.keys(node.virtualRange)) {
    if (!["buffer", "itemCount", "itemExtent", "orientation", "viewportExtent"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_VIRTUAL_RANGE_FIELD_UNSUPPORTED", message: `UI virtualRange uses unsupported field '${key}'.`, path: `${path}/virtualRange/${key}` });
    }
  }
  for (const key of ["itemCount", "itemExtent", "viewportExtent"]) {
    const value = node.virtualRange[key as keyof typeof node.virtualRange];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      diagnostics.push({ code: "TN_IR_UI_VIRTUAL_RANGE_NUMBER_INVALID", message: `UI virtualRange ${key} must be a finite positive number.`, path: `${path}/virtualRange/${key}` });
    }
  }
  if (node.virtualRange.buffer !== undefined && (typeof node.virtualRange.buffer !== "number" || !Number.isFinite(node.virtualRange.buffer) || node.virtualRange.buffer < 0)) {
    diagnostics.push({ code: "TN_IR_UI_VIRTUAL_RANGE_NUMBER_INVALID", message: "UI virtualRange buffer must be a finite non-negative number.", path: `${path}/virtualRange/buffer` });
  }
  if (node.virtualRange.orientation !== undefined && !["horizontal", "vertical"].includes(String(node.virtualRange.orientation))) {
    diagnostics.push({ code: "TN_IR_UI_VIRTUAL_RANGE_ORIENTATION_INVALID", message: "UI virtualRange orientation must be horizontal or vertical.", path: `${path}/virtualRange/orientation` });
  }
}

function validateUiAttachment(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], entityIds: Set<string>): void {
  if (node.attachTo === undefined) {
    return;
  }
  if (!isRecord(node.attachTo)) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_INVALID", message: "UI attachTo metadata must be an object.", path: `${path}/attachTo` });
    return;
  }
  for (const key of Object.keys(node.attachTo)) {
    if (["cameraHandle", "renderToTexture", "sceneMesh", "surface3d", "worldSpaceMesh"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_UI_ATTACHMENT_SURFACE_UNSUPPORTED",
        message: `UI attachment '${node.id}' uses unsupported 3D/render surface field '${key}'.`,
        path: `${path}/attachTo/${key}`,
        suggestion: "Keep attached UI as retained screen-space UI with attachTo projection metadata.",
      });
    } else if (!["anchor", "clamp", "distanceScale", "localOffset", "maxDistance", "occlusion", "sortPriority", "target"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_FIELD_UNSUPPORTED", message: `UI attachTo uses unsupported field '${key}'.`, path: `${path}/attachTo/${key}` });
    }
  }
  const attach = node.attachTo;
  if (!isRecord(attach.target)) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_TARGET_INVALID", message: "UI attachTo target must be an object.", path: `${path}/attachTo/target` });
  } else {
    if (!["entity", "prefabInstance", "selectedEntity"].includes(String(attach.target.kind))) {
      diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_TARGET_KIND_INVALID", message: "UI attachTo target kind must be entity, prefabInstance, or selectedEntity.", path: `${path}/attachTo/target/kind` });
    }
    if (attach.target.kind === "entity") {
      if (typeof attach.target.id !== "string" || attach.target.id.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_TARGET_INVALID", message: "UI entity attachment target must include a non-empty id.", path: `${path}/attachTo/target/id` });
      } else if (!entityIds.has(attach.target.id)) {
        diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_TARGET_UNDECLARED", message: `UI node '${node.id}' attaches to undeclared entity '${attach.target.id}'.`, path: `${path}/attachTo/target/id` });
      }
    }
    if (attach.target.kind === "selectedEntity" && (typeof attach.target.binding !== "string" || attach.target.binding.trim() === "")) {
      diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_TARGET_INVALID", message: "UI selectedEntity attachment target must include a binding.", path: `${path}/attachTo/target/binding` });
    }
  }
  if (attach.anchor !== undefined && !["bottom", "center", "left", "right", "top"].includes(String(attach.anchor))) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_ANCHOR_INVALID", message: "UI attachment anchor must be top, bottom, left, right, or center.", path: `${path}/attachTo/anchor` });
  }
  if (attach.clamp !== undefined && !["none", "screenEdge"].includes(String(attach.clamp))) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_CLAMP_INVALID", message: "UI attachment clamp must be none or screenEdge.", path: `${path}/attachTo/clamp` });
  }
  if (attach.occlusion !== undefined && !["fade", "hide", "show"].includes(String(attach.occlusion))) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_OCCLUSION_INVALID", message: "UI attachment occlusion must be show, hide, or fade.", path: `${path}/attachTo/occlusion` });
  }
  if (attach.localOffset !== undefined && (!Array.isArray(attach.localOffset) || attach.localOffset.length !== 3 || attach.localOffset.some((value) => typeof value !== "number" || !Number.isFinite(value)))) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_OFFSET_INVALID", message: "UI attachment localOffset must be a finite Vec3.", path: `${path}/attachTo/localOffset` });
  }
  if (attach.distanceScale !== undefined) {
    if (!isRecord(attach.distanceScale) || typeof attach.distanceScale.min !== "number" || typeof attach.distanceScale.max !== "number" || !Number.isFinite(attach.distanceScale.min) || !Number.isFinite(attach.distanceScale.max) || attach.distanceScale.min <= 0 || attach.distanceScale.max < attach.distanceScale.min) {
      diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_SCALE_INVALID", message: "UI attachment distanceScale must include finite positive min <= max.", path: `${path}/attachTo/distanceScale` });
    }
  }
  if (attach.maxDistance !== undefined && (typeof attach.maxDistance !== "number" || !Number.isFinite(attach.maxDistance) || attach.maxDistance <= 0)) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_DISTANCE_INVALID", message: "UI attachment maxDistance must be finite and positive.", path: `${path}/attachTo/maxDistance` });
  }
  if (attach.sortPriority !== undefined && (typeof attach.sortPriority !== "number" || !Number.isFinite(attach.sortPriority))) {
    diagnostics.push({ code: "TN_IR_UI_ATTACHMENT_SORT_INVALID", message: "UI attachment sortPriority must be finite.", path: `${path}/attachTo/sortPriority` });
  }
}

function validateUiEffects(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (node.effects === undefined) {
    return;
  }
  if (!Array.isArray(node.effects)) {
    diagnostics.push({ code: "TN_IR_UI_EFFECTS_INVALID", message: "UI effects must be an array.", path: `${path}/effects` });
    return;
  }
  const ids = new Set<string>();
  node.effects.forEach((effect, index) => {
    const effectPath = `${path}/effects/${index}`;
    if (!isRecord(effect)) {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_INVALID", message: "UI effect metadata must be an object.", path: effectPath });
      return;
    }
    for (const key of Object.keys(effect)) {
      if (["shader", "shaderRef", "material", "materialRef", "filter", "cssFilter", "renderHandle"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_UI_EFFECT_ESCAPE_UNSUPPORTED",
          message: `UI effect '${String(effect.id ?? index)}' uses unsupported renderer-specific field '${key}'.`,
          path: `${effectPath}/${key}`,
          suggestion: "Use bounded glow, outline, pulse, tint, or focusRing presets with fallback strategy metadata.",
        });
      } else if (!["color", "fallback", "id", "intensity", "kind", "predicate", "pulse", "radius", "trigger"].includes(key)) {
        diagnostics.push({ code: "TN_IR_UI_EFFECT_FIELD_UNSUPPORTED", message: `UI effect uses unsupported field '${key}'.`, path: `${effectPath}/${key}` });
      }
    }
    if (typeof effect.id !== "string" || effect.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_ID_INVALID", message: "UI effect id must be a non-empty string.", path: `${effectPath}/id` });
    } else if (ids.has(effect.id)) {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_ID_DUPLICATE", message: `UI effect '${effect.id}' is duplicated on node '${node.id}'.`, path: `${effectPath}/id` });
    }
    ids.add(String(effect.id));
    if (!["focusRing", "glow", "outline", "pulse", "tint"].includes(String(effect.kind))) {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_KIND_INVALID", message: "UI effect kind must be glow, outline, pulse, tint, or focusRing.", path: `${effectPath}/kind` });
    }
    if (!["disabled", "focus", "hover", "predicate", "selected"].includes(String(effect.trigger))) {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_TRIGGER_INVALID", message: "UI effect trigger must be focus, hover, selected, disabled, or predicate.", path: `${effectPath}/trigger` });
    }
    if (effect.fallback !== undefined && !["none", "outline", "shadow", "tint"].includes(String(effect.fallback))) {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_FALLBACK_INVALID", message: "UI effect fallback must be none, outline, shadow, or tint.", path: `${effectPath}/fallback` });
    }
    for (const key of ["intensity", "radius"] as const) {
      const value = effect[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        diagnostics.push({ code: "TN_IR_UI_EFFECT_NUMBER_INVALID", message: `UI effect ${key} must be a finite non-negative number.`, path: `${effectPath}/${key}` });
      }
    }
    if (effect.pulse !== undefined) {
      if (!isRecord(effect.pulse)) {
        diagnostics.push({ code: "TN_IR_UI_EFFECT_PULSE_INVALID", message: "UI effect pulse metadata must be an object.", path: `${effectPath}/pulse` });
      } else {
        if (typeof effect.pulse.durationMs !== "number" || !Number.isFinite(effect.pulse.durationMs) || effect.pulse.durationMs <= 0) {
          diagnostics.push({ code: "TN_IR_UI_EFFECT_PULSE_INVALID", message: "UI effect pulse durationMs must be finite and positive.", path: `${effectPath}/pulse/durationMs` });
        }
        const iterations = (effect.pulse as { iterations?: unknown }).iterations;
        if (iterations !== undefined && (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations <= 0)) {
          diagnostics.push({ code: "TN_IR_UI_EFFECT_UNBOUNDED_ANIMATION", message: "UI pulse effects must declare a positive finite iteration count when iterations are present.", path: `${effectPath}/pulse/iterations` });
        }
      }
    }
    if (effect.trigger === "predicate") {
      validateUiEffectPredicate(effect.predicate, `${effectPath}/predicate`, diagnostics);
    } else if (effect.predicate !== undefined) {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_PREDICATE_TRIGGER_INVALID", message: "UI effect predicates are only valid with predicate triggers.", path: `${effectPath}/predicate` });
    }
  });
}

function validateUiEffectPredicate(predicate: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(predicate)) {
    diagnostics.push({ code: "TN_IR_UI_EFFECT_PREDICATE_INVALID", message: "UI predicate effects must declare predicate metadata.", path });
    return;
  }
  for (const key of Object.keys(predicate)) {
    if (!["component", "entity", "equals", "field", "resource"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_EFFECT_PREDICATE_FIELD_UNSUPPORTED", message: `UI effect predicate uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  const hasResource = typeof predicate.resource === "string" && predicate.resource.trim() !== "";
  const hasComponent = typeof predicate.component === "string" && predicate.component.trim() !== "" && typeof predicate.entity === "string" && predicate.entity.trim() !== "";
  if (!hasResource && !hasComponent) {
    diagnostics.push({ code: "TN_IR_UI_EFFECT_PREDICATE_TARGET_INVALID", message: "UI effect predicate must target a declared resource or component/entity pair.", path });
  }
}

function validateUiAffordances(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (node.glyph !== undefined) {
    if (!isRecord(node.glyph)) {
      diagnostics.push({ code: "TN_IR_UI_GLYPH_INVALID", message: "UI glyph metadata must be an object.", path: `${path}/glyph` });
    } else {
      if (typeof node.glyph.action !== "string" || node.glyph.action.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_GLYPH_ACTION_INVALID", message: "UI glyph action must be a non-empty action id.", path: `${path}/glyph/action` });
      }
      if (node.glyph.glyphSet !== undefined && !["gamepad", "keyboard", "touch"].includes(String(node.glyph.glyphSet))) {
        diagnostics.push({ code: "TN_IR_UI_GLYPH_SET_INVALID", message: "UI glyph set must be keyboard, gamepad, or touch.", path: `${path}/glyph/glyphSet` });
      }
      if (node.action !== undefined && node.glyph.action !== node.action) {
        diagnostics.push({ code: "TN_IR_UI_GLYPH_ACTION_INVALID", message: "UI glyph action must match the node action when both are declared.", path: `${path}/glyph/action` });
      }
    }
  }
  if (node.tooltip !== undefined) {
    if (!isRecord(node.tooltip)) {
      diagnostics.push({ code: "TN_IR_UI_TOOLTIP_INVALID", message: "UI tooltip metadata must be an object.", path: `${path}/tooltip` });
    } else {
      if (typeof node.tooltip.anchor !== "string" || node.tooltip.anchor.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_TOOLTIP_ANCHOR_INVALID", message: "UI tooltip anchor must be a non-empty node id.", path: `${path}/tooltip/anchor` });
      }
      if (!["focus", "hover", "manual"].includes(String(node.tooltip.open))) {
        diagnostics.push({ code: "TN_IR_UI_TOOLTIP_OPEN_INVALID", message: "UI tooltip open policy must be focus, hover, or manual.", path: `${path}/tooltip/open` });
      }
      if (typeof node.tooltip.description !== "string" || node.tooltip.description.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_TOOLTIP_DESCRIPTION_INVALID", message: "UI tooltip description must be non-empty.", path: `${path}/tooltip/description` });
      }
      if (node.tooltip.delayMs !== undefined && (!Number.isFinite(node.tooltip.delayMs) || node.tooltip.delayMs < 0)) {
        diagnostics.push({ code: "TN_IR_UI_TOOLTIP_DELAY_INVALID", message: "UI tooltip delayMs must be a finite non-negative number.", path: `${path}/tooltip/delayMs` });
      }
      if (node.tooltip.focus !== undefined && !["move", "preserve"].includes(String(node.tooltip.focus))) {
        diagnostics.push({ code: "TN_IR_UI_TOOLTIP_FOCUS_INVALID", message: "UI tooltip focus behavior must be move or preserve.", path: `${path}/tooltip/focus` });
      }
    }
  }
  if (node.localization !== undefined) {
    if (!isRecord(node.localization)) {
      diagnostics.push({ code: "TN_IR_UI_LOCALIZATION_INVALID", message: "UI localization metadata must be an object.", path: `${path}/localization` });
    } else {
      if (typeof node.localization.key !== "string" || node.localization.key.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_LOCALIZATION_KEY_INVALID", message: "UI localization key must be non-empty.", path: `${path}/localization/key` });
      }
      if (typeof node.localization.fallback !== "string" || node.localization.fallback.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_LOCALIZATION_FALLBACK_MISSING", message: "UI localization metadata must include non-empty fallback text.", path: `${path}/localization/fallback` });
      }
      if (node.localization.params !== undefined && !isRecord(node.localization.params)) {
        diagnostics.push({ code: "TN_IR_UI_LOCALIZATION_PARAMS_INVALID", message: "UI localization params must be an object when present.", path: `${path}/localization/params` });
      }
      if (node.localization.cases !== undefined) {
        if (!isRecord(node.localization.cases)) {
          diagnostics.push({ code: "TN_IR_UI_LOCALIZATION_CASES_INVALID", message: "UI localization cases must be an object when present.", path: `${path}/localization/cases` });
        } else {
          Object.entries(node.localization.cases).forEach(([caseId, text]) => {
            if (caseId.trim() === "" || typeof text !== "string" || text.trim() === "") {
              diagnostics.push({ code: "TN_IR_UI_LOCALIZATION_CASES_INVALID", message: "UI localization case ids and text must be non-empty strings.", path: `${path}/localization/cases/${caseId}` });
            }
          });
        }
      }
    }
  }
  if (node.progress !== undefined) {
    if (!isRecord(node.progress)) {
      diagnostics.push({ code: "TN_IR_UI_PROGRESS_INVALID", message: "UI progress metadata must be an object.", path: `${path}/progress` });
    } else {
      if (node.progress.kind !== undefined && !["bar", "radial", "ring", "segmented", "text"].includes(String(node.progress.kind))) {
        diagnostics.push({ code: "TN_IR_UI_PROGRESS_KIND_INVALID", message: "UI progress kind must be bar, ring, radial, segmented, or text.", path: `${path}/progress/kind` });
      }
      const segments = (node.progress as { segments?: unknown }).segments;
      if (segments !== undefined && (typeof segments !== "number" || !Number.isInteger(segments) || segments <= 0)) {
        diagnostics.push({ code: "TN_IR_UI_PROGRESS_SEGMENTS_INVALID", message: "UI progress segments must be a positive integer.", path: `${path}/progress/segments` });
      }
      if (node.progress.cooldown !== undefined && typeof node.progress.cooldown !== "boolean") {
        diagnostics.push({ code: "TN_IR_UI_PROGRESS_COOLDOWN_INVALID", message: "UI progress cooldown must be a boolean when present.", path: `${path}/progress/cooldown` });
      }
    }
  }
  for (const [index, feedback] of (node.feedback ?? []).entries()) {
    const feedbackPath = `${path}/feedback/${index}`;
    if (!isRecord(feedback)) {
      diagnostics.push({ code: "TN_IR_UI_FEEDBACK_INVALID", message: "UI feedback hook must be an object.", path: feedbackPath });
      continue;
    }
    if (!["activate", "focus", "valueChange"].includes(String(feedback.trigger))) {
      diagnostics.push({ code: "TN_IR_UI_FEEDBACK_TRIGGER_INVALID", message: "UI feedback trigger must be activate, focus, or valueChange.", path: `${feedbackPath}/trigger` });
    }
    if (feedback.audio === undefined && feedback.haptic === undefined) {
      diagnostics.push({ code: "TN_IR_UI_FEEDBACK_TARGET_MISSING", message: "UI feedback hook must declare audio or haptic target.", path: feedbackPath });
    }
  }
}

function validateUiGridLayout(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_INVALID", message: "UI layout grid must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["autoFlow", "columns", "rows"].includes(key)) {
      if (["area", "areas", "autoPlacement", "column", "columnSpan", "dense", "namedAreas", "placement", "row", "rowSpan", "templateAreas", "templateColumns", "templateRows"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_UI_LAYOUT_GRID_ADVANCED_UNSUPPORTED",
          message: `UI layout grid field '${key}' requires arbitrary placement or named-area support outside the portable grid subset.`,
          path: `${path}/${key}`,
          severity: "error",
          suggestion: "Use repeat-count columns/rows and row or column autoFlow until advanced grid placement is promoted.",
        });
      } else {
        diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_FIELD_UNSUPPORTED", message: `UI layout grid uses unsupported field '${key}'.`, path: `${path}/${key}` });
      }
    }
  }
  if (value.autoFlow === "dense") {
    diagnostics.push({
      code: "TN_IR_UI_LAYOUT_GRID_ADVANCED_UNSUPPORTED",
      message: "UI layout grid dense auto-placement is outside the portable grid subset.",
      path: `${path}/autoFlow`,
      severity: "error",
      suggestion: "Use row or column autoFlow until dense packing has matching web and native evidence.",
    });
  }
  if (value.autoFlow !== undefined && !["column", "row"].includes(String(value.autoFlow))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_AUTO_FLOW_INVALID", message: "UI layout grid autoFlow must be row or column.", path: `${path}/autoFlow` });
  }
  for (const key of ["columns", "rows"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isInteger(item) || item < 1)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_TRACK_INVALID", message: `UI layout grid ${key} must be a positive integer.`, path: `${path}/${key}` });
    }
  }
  if (value.columns === undefined && value.rows === undefined) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_TRACK_MISSING", message: "UI layout grid must declare columns or rows.", path });
  }
}

function collectFocusableUiIds(node: IUiNodeIr, focusableIds: Set<string>): void {
  if (node.focusable === true || node.kind === "button" || node.kind === "textInput" || node.kind === "touchControl") {
    focusableIds.add(node.id);
  }
  node.children?.forEach((child) => collectFocusableUiIds(child, focusableIds));
}

function validateUiMetadata(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>, focusableIds: Set<string>): void {
  const raw = ui as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["components", "focusOrder", "fonts", "generatedNodeProvenance", "inputActions", "root", "safeArea", "schema", "screenStack", "screens", "theme", "toastQueues", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_UI_FIELD_UNSUPPORTED",
        message: `UI IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  validateUiFocusOrder(ui.focusOrder, `${path}/focusOrder`, diagnostics, focusableIds);
  validateUiSafeArea(ui.safeArea, `${path}/safeArea`, diagnostics);
  validateUiInputActions(ui.inputActions, `${path}/inputActions`, diagnostics);
  validateUiToastQueues(ui, path, diagnostics);
  validateUiNavigation(ui.root, `${path}/root`, diagnostics, ids, focusableIds);
  validateUiScreens(ui, path, diagnostics, ids, focusableIds);
}

function validateUiToastQueues(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const [index, queue] of (ui.toastQueues ?? []).entries()) {
    const queuePath = `${path}/toastQueues/${index}`;
    if (typeof queue.id !== "string" || queue.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_TOAST_QUEUE_ID_INVALID", message: "UI toast queue id must be non-empty.", path: `${queuePath}/id` });
    }
    if (!Number.isFinite(queue.durationMs) || queue.durationMs <= 0) {
      diagnostics.push({ code: "TN_IR_UI_TOAST_QUEUE_DURATION_INVALID", message: "UI toast queue durationMs must be finite and positive.", path: `${queuePath}/durationMs` });
    }
    if (!Number.isInteger(queue.maxVisible) || queue.maxVisible <= 0) {
      diagnostics.push({ code: "TN_IR_UI_TOAST_QUEUE_MAX_VISIBLE_INVALID", message: "UI toast queue maxVisible must be a positive integer.", path: `${queuePath}/maxVisible` });
    }
    if (queue.coalesce !== undefined && !["count", "drop", "none"].includes(queue.coalesce)) {
      diagnostics.push({ code: "TN_IR_UI_TOAST_QUEUE_COALESCE_INVALID", message: "UI toast queue coalesce must be count, drop, or none.", path: `${queuePath}/coalesce` });
    }
  }
}

function validateUiScreens(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>, focusableIds: Set<string>): void {
  const screens = ui.screens ?? [];
  const screenIds = new Set<string>();
  const activeIds = new Set(ui.screenStack?.active ?? screens.filter((screen) => screen.active === true).map((screen) => screen.id));
  let activeExclusiveCount = 0;

  screens.forEach((screen, index) => {
    const screenPath = `${path}/screens/${index}`;
    if (typeof screen.id !== "string" || screen.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_ID_INVALID", message: "UI screen id must be a non-empty string.", path: `${screenPath}/id` });
    } else if (screenIds.has(screen.id)) {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_DUPLICATE", message: `UI screen '${screen.id}' is duplicated.`, path: `${screenPath}/id` });
    }
    screenIds.add(String(screen.id));
    if (!["dialog", "hud", "loading", "menu", "modal", "overlay"].includes(String(screen.role))) {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_ROLE_INVALID", message: "UI screen role must be hud, menu, modal, overlay, loading, or dialog.", path: `${screenPath}/role` });
    }
    if (!ids.has(screen.root)) {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_ROOT_INVALID", message: `UI screen '${screen.id}' references missing root node '${screen.root}'.`, path: `${screenPath}/root` });
    }
    if (screen.stackPolicy !== undefined && !["exclusiveModal", "overlay", "pop", "push", "replace"].includes(screen.stackPolicy)) {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_STACK_POLICY_INVALID", message: "UI screen stackPolicy must be replace, push, pop, overlay, or exclusiveModal.", path: `${screenPath}/stackPolicy` });
    }
    if (activeIds.has(screen.id) && (screen.stackPolicy === "exclusiveModal" || screen.role === "modal")) {
      activeExclusiveCount += 1;
    }
    if (activeIds.has(screen.id) && screen.hidden === true) {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_ACTIVE_HIDDEN", message: `UI screen '${screen.id}' is hidden but active in the screen stack.`, path: `${screenPath}/hidden` });
    }
    validateUiFocusScope(screen.focusScope, `${screenPath}/focusScope`, diagnostics, focusableIds);
    if ((screen.role === "modal" || screen.role === "dialog" || screen.stackPolicy === "exclusiveModal") && screen.focusScope?.inputCapture === "none") {
      diagnostics.push({ code: "TN_IR_UI_MODAL_CAPTURE_MISSING", message: `UI modal screen '${screen.id}' must capture input.`, path: `${screenPath}/focusScope/inputCapture` });
    }
  });

  if (activeExclusiveCount > 1) {
    diagnostics.push({ code: "TN_IR_UI_SCREEN_EXCLUSIVE_DUPLICATE", message: "Only one active exclusive modal screen is allowed.", path: `${path}/screenStack/active` });
  }
  validateUiScreenStack(ui.screenStack, `${path}/screenStack`, diagnostics, screenIds);
}

function validateUiFocusScope(focusScope: IUiFocusScopeIr | undefined, path: string, diagnostics: IIrDiagnostic[], focusableIds: Set<string>): void {
  if (focusScope === undefined) {
    return;
  }
  if (!focusableIds.has(focusScope.entry)) {
    diagnostics.push({ code: "TN_IR_UI_FOCUS_SCOPE_ENTRY_INVALID", message: `UI focus scope entry '${focusScope.entry}' must reference a focusable node.`, path: `${path}/entry` });
  }
  if (focusScope.trap === true && focusScope.escapeAction === undefined && focusScope.backAction === undefined) {
    diagnostics.push({ code: "TN_IR_UI_FOCUS_TRAP_EXIT_MISSING", message: "UI focus traps must declare escapeAction or backAction.", path });
  }
  if (!["keyboard", "modal", "none", "pointer", "pointer-and-keyboard"].includes(String(focusScope.inputCapture))) {
    diagnostics.push({ code: "TN_IR_UI_INPUT_CAPTURE_INVALID", message: "UI inputCapture must be none, pointer, keyboard, pointer-and-keyboard, or modal.", path: `${path}/inputCapture` });
  }
  if (focusScope.restore !== undefined && focusScope.restore !== "none" && focusScope.restore !== "previous") {
    diagnostics.push({ code: "TN_IR_UI_FOCUS_RESTORE_INVALID", message: "UI focus restore must be previous or none.", path: `${path}/restore` });
  }
}

function validateUiScreenStack(stack: IUiIr["screenStack"], path: string, diagnostics: IIrDiagnostic[], screenIds: Set<string>): void {
  if (stack === undefined) {
    return;
  }
  if (!Array.isArray(stack.active)) {
    diagnostics.push({ code: "TN_IR_UI_SCREEN_STACK_ACTIVE_INVALID", message: "UI screenStack.active must be an array.", path: `${path}/active` });
    return;
  }
  stack.active.forEach((id, index) => {
    if (typeof id !== "string" || id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_STACK_ACTIVE_INVALID", message: "UI screenStack.active entries must be non-empty screen IDs.", path: `${path}/active/${index}` });
    } else if (!screenIds.has(id)) {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_STACK_REF_INVALID", message: `UI screenStack references missing screen '${id}'.`, path: `${path}/active/${index}` });
    }
  });
  if (stack.policy !== undefined && !["exclusiveModal", "overlay", "pop", "push", "replace"].includes(stack.policy)) {
    diagnostics.push({ code: "TN_IR_UI_SCREEN_STACK_POLICY_INVALID", message: "UI screenStack policy must be replace, push, pop, overlay, or exclusiveModal.", path: `${path}/policy` });
  }
  stack.transitions?.forEach((transition, index) => {
    if (!["exclusiveModal", "overlay", "pop", "push", "replace"].includes(transition.kind)) {
      diagnostics.push({ code: "TN_IR_UI_SCREEN_TRANSITION_INVALID", message: "UI screen transition kind must be replace, push, pop, overlay, or exclusiveModal.", path: `${path}/transitions/${index}/kind` });
    }
  });
}

function validateUiFocusOrder(value: unknown, path: string, diagnostics: IIrDiagnostic[], focusableIds: Set<string>): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_UI_FOCUS_ORDER_INVALID", message: "UI focusOrder must be an array.", path });
    return;
  }
  const seen = new Set<string>();
  value.forEach((id, index) => {
    if (typeof id !== "string" || id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_FOCUS_ID_INVALID", message: "UI focusOrder entries must be non-empty node IDs.", path: `${path}/${index}` });
    } else if (seen.has(id)) {
      diagnostics.push({ code: "TN_IR_UI_FOCUS_ID_DUPLICATE", message: `UI focusOrder ID '${id}' is duplicated.`, path: `${path}/${index}` });
    } else if (!focusableIds.has(id)) {
      diagnostics.push({ code: "TN_IR_UI_FOCUS_TARGET_INVALID", message: `UI focusOrder references non-focusable or missing node '${id}'.`, path: `${path}/${index}` });
    }
    seen.add(String(id));
  });
}

function validateUiSafeArea(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || !["avoid", "none"].includes(value.mode as string)) {
    diagnostics.push({ code: "TN_IR_UI_SAFE_AREA_INVALID", message: "UI safeArea mode must be 'avoid' or 'none'.", path });
    return;
  }
  if (value.edges !== undefined && (!Array.isArray(value.edges) || value.edges.some((edge) => !["bottom", "left", "right", "top"].includes(edge as string)))) {
    diagnostics.push({ code: "TN_IR_UI_SAFE_AREA_EDGE_INVALID", message: "UI safeArea edges must be top, right, bottom, or left.", path: `${path}/edges` });
  }
}

function validateUiInputActions(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_INPUT_ACTIONS_INVALID", message: "UI inputActions must be an object.", path });
    return;
  }
  for (const [key, action] of Object.entries(value)) {
    if (!["activate", "cancel", "next", "previous"].includes(key) || typeof action !== "string" || action.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_INPUT_ACTION_INVALID", message: `UI input action '${key}' must reference a non-empty action ID.`, path: `${path}/${key}` });
    }
  }
}

function validateUiNavigation(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>, focusableIds: Set<string>): void {
  const navigation = node.navigation as unknown;
  if (navigation !== undefined) {
    if (!isRecord(navigation)) {
      diagnostics.push({ code: "TN_IR_UI_NAVIGATION_INVALID", message: "UI navigation must be an object.", path: `${path}/navigation` });
    } else {
      for (const [direction, target] of Object.entries(navigation)) {
        if (!["down", "left", "right", "up"].includes(direction) || typeof target !== "string" || !ids.has(target) || !focusableIds.has(target)) {
          diagnostics.push({ code: "TN_IR_UI_NAVIGATION_TARGET_INVALID", message: `UI navigation '${direction}' must reference a focusable node.`, path: `${path}/navigation/${direction}` });
        }
      }
    }
  }
  node.children?.forEach((child, index) => validateUiNavigation(child, `${path}/children/${index}`, diagnostics, ids, focusableIds));
}
