import type { IUiIr, IUiNodeIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { isRecord } from "./validationPrimitives.js";

export function validateUi(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[]): void {
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
  validateUiNode(ui.root, `${path}/root`, diagnostics, ids, fontFamilies);
  collectFocusableUiIds(ui.root, focusableIds);
  validateUiMetadata(ui, path, diagnostics, ids, focusableIds);
}
function validateUiNode(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>, fontFamilies: Set<string>): void {
  const raw = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["accessibilityLabel", "action", "anchorId", "binding", "children", "disabled", "focusable", "id", "image", "kind", "label", "layout", "max", "min", "minimap", "navigation", "orientation", "role", "spans", "src", "step", "style", "text", "value", "valueText"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_UI_FIELD_UNSUPPORTED",
        message: `UI node '${node.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  validateUnsupportedUiRequests(raw, path, diagnostics);
  validateUiLayout(node.layout, `${path}/layout`, diagnostics);
  validateUiStyle(node.style, `${path}/style`, diagnostics, fontFamilies);
  validateUiSpans(node, path, diagnostics, fontFamilies);
  validateUiImageMetadata(node, path, diagnostics);
  if (node.kind === "minimap") {
    validateUiMinimapMetadata(node, path, diagnostics);
  }
  validateUiWidget(node, path, diagnostics);
  validateUiAccessibility(node, path, diagnostics);
  if (!["bar", "button", "column", "contextMenu", "image", "minimap", "row", "scrollbar", "slider", "stack", "text", "textInput", "touchControl"].includes(node.kind)) {
    diagnostics.push({
      code: "TN_IR_UI_NODE_UNSUPPORTED",
      message: `Unsupported UI node kind '${String(node.kind)}'.`,
      path: `${path}/kind`,
    });
  }
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
  node.children?.forEach((child, index) => validateUiNode(child, `${path}/children/${index}`, diagnostics, ids, fontFamilies));
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

function validateUiGradient(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_GRADIENT_INVALID", message: "UI style gradient must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["angle", "from", "kind", "to"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_FIELD_UNSUPPORTED", message: `UI style gradient uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (value.kind !== "linear") {
    diagnostics.push({ code: "TN_IR_UI_STYLE_GRADIENT_INVALID", message: "UI style gradient kind must be linear.", path: `${path}/kind` });
  }
  for (const key of ["from", "to"]) {
    const item = value[key];
    if (typeof item !== "string" || !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(item)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: `UI style gradient ${key} must be #RRGGBB or #RRGGBBAA.`, path: `${path}/${key}` });
    }
  }
  if (value.angle !== undefined && (typeof value.angle !== "number" || !Number.isFinite(value.angle))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: "UI style gradient angle must be a finite number.", path: `${path}/angle` });
  }
}

function validateUiShadow(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_SHADOW_INVALID", message: "UI style shadow must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["blur", "color", "offsetX", "offsetY", "spread"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_FIELD_UNSUPPORTED", message: `UI style shadow uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (typeof value.color !== "string" || !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.color)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: "UI style shadow color must be #RRGGBB or #RRGGBBAA.", path: `${path}/color` });
  }
  for (const key of ["offsetX", "offsetY"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item))) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: `UI style shadow ${key} must be a finite number.`, path: `${path}/${key}` });
    }
  }
  for (const key of ["blur", "spread"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: `UI style shadow ${key} must be a finite non-negative number.`, path: `${path}/${key}` });
    }
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
    if (!["focusOrder", "fonts", "inputActions", "root", "safeArea", "schema", "version"].includes(key)) {
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
  validateUiNavigation(ui.root, `${path}/root`, diagnostics, ids, focusableIds);
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
