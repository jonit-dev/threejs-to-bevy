import type { IUiIr, IUiThemeTokenIr, UiThemeTokenKind } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { isRecord } from "./validationPrimitives.js";

export function validateUiTheme(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[]): Map<string, IUiThemeTokenIr> {
  const tokens = new Map<string, IUiThemeTokenIr>();
  if (ui.theme === undefined) {
    return tokens;
  }
  const rawTheme = ui.theme as unknown;
  if (!isRecord(rawTheme)) {
    diagnostics.push({ code: "TN_IR_UI_THEME_INVALID", message: "UI theme must be an object.", path: `${path}/theme` });
    return tokens;
  }
  for (const key of Object.keys(rawTheme)) {
    if (!["componentVariants", "tokens"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_THEME_FIELD_UNSUPPORTED", message: `UI theme uses unsupported field '${key}'.`, path: `${path}/theme/${key}` });
    }
  }
  if (!Array.isArray(ui.theme.tokens)) {
    diagnostics.push({ code: "TN_IR_UI_THEME_TOKENS_INVALID", message: "UI theme tokens must be an array.", path: `${path}/theme/tokens` });
    return tokens;
  }
  ui.theme.tokens.forEach((token, index) => {
    const tokenPath = `${path}/theme/tokens/${index}`;
    if (typeof token.id !== "string" || token.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_ID_INVALID", message: "UI theme token id must be a non-empty string.", path: `${tokenPath}/id` });
      return;
    }
    if (tokens.has(token.id)) {
      diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_DUPLICATE", message: `UI theme token '${token.id}' is duplicated.`, path: `${tokenPath}/id` });
    }
    tokens.set(token.id, token);
    validateUiThemeToken(token, tokenPath, diagnostics);
  });
  for (const token of ui.theme.tokens) {
    validateUiThemeTokenAlias(token, `${path}/theme/tokens`, diagnostics, tokens, []);
  }
  ui.theme.componentVariants?.forEach((variant, index) => {
    const variantPath = `${path}/theme/componentVariants/${index}`;
    if (typeof variant.id !== "string" || variant.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_VARIANT_ID_INVALID", message: "UI component variant id must be a non-empty string.", path: `${variantPath}/id` });
    }
    validateUiTokenRefs(variant.tokenRefs, `${variantPath}/tokenRefs`, diagnostics, tokens);
  });
  return tokens;
}

function validateUiThemeToken(token: IUiThemeTokenIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!["border", "color", "focusRing", "fontFamily", "gradient", "icon", "image", "radius", "shadow", "spacing", "textSize"].includes(token.kind)) {
    diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_KIND_INVALID", message: "UI theme token kind is not in the portable token set.", path: `${path}/kind` });
    return;
  }
  if (isRecord(token.value) && token.value.alias !== undefined) {
    if (typeof token.value.alias !== "string" || token.value.alias.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_ALIAS_INVALID", message: "UI theme token alias must reference a non-empty token id.", path: `${path}/value/alias` });
    }
    return;
  }
  switch (token.kind) {
    case "color":
      validateTokenString(token.value, /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "TN_IR_UI_THEME_TOKEN_VALUE_INVALID", "Color tokens must be #RRGGBB or #RRGGBBAA.", `${path}/value`, diagnostics);
      break;
    case "spacing":
    case "radius":
    case "border":
    case "textSize":
      if (typeof token.value !== "number" || !Number.isFinite(token.value) || token.value < 0) {
        diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_VALUE_INVALID", message: `${token.kind} tokens must be finite non-negative numbers.`, path: `${path}/value` });
      }
      break;
    case "fontFamily":
    case "icon":
    case "image":
      if (typeof token.value !== "string" || token.value.trim() === "") {
        diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_VALUE_INVALID", message: `${token.kind} tokens must be non-empty strings.`, path: `${path}/value` });
      }
      break;
    case "gradient":
      validateUiGradient(token.value, `${path}/value`, diagnostics);
      break;
    case "shadow":
      validateUiShadow(token.value, `${path}/value`, diagnostics);
      break;
    case "focusRing":
      validateFocusRingToken(token.value, `${path}/value`, diagnostics);
      break;
  }
}

function validateUiThemeTokenAlias(token: IUiThemeTokenIr, path: string, diagnostics: IIrDiagnostic[], tokens: Map<string, IUiThemeTokenIr>, stack: string[]): void {
  if (!isRecord(token.value) || typeof token.value.alias !== "string") {
    return;
  }
  const target = tokens.get(token.value.alias);
  if (target === undefined) {
    diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_ALIAS_MISSING", message: `UI theme token '${token.id}' aliases missing token '${token.value.alias}'.`, path: `${path}/${token.id}/value/alias` });
    return;
  }
  if (target.kind !== token.kind) {
    diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_ALIAS_KIND_INVALID", message: `UI theme token '${token.id}' aliases '${target.id}' with a different token kind.`, path: `${path}/${token.id}/value/alias` });
  }
  if (stack.includes(token.id)) {
    const cycle = [...stack.slice(stack.indexOf(token.id)), token.id];
    diagnostics.push({
      code: "TN_IR_UI_THEME_TOKEN_ALIAS_CYCLE",
      message: `UI theme token alias cycle detected: ${cycle.join(" -> ")}.`,
      path: `${path}/${token.id}/value/alias`,
      severity: "error",
      suggestion: "Replace one alias with a concrete token value or point it at a token outside the cycle.",
    });
    return;
  }
  validateUiThemeTokenAlias(target, path, diagnostics, tokens, [...stack, token.id]);
}

export function validateUiTokenRefs(value: unknown, path: string, diagnostics: IIrDiagnostic[], tokens: Map<string, IUiThemeTokenIr>): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_TOKEN_REFS_INVALID", message: "UI tokenRefs must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["image", "layout", "style"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_TOKEN_REF_FIELD_UNSUPPORTED", message: `UI tokenRefs uses unsupported section '${key}'.`, path: `${path}/${key}` });
    }
  }
  validateTokenRefMap(value.layout, `${path}/layout`, diagnostics, tokens, {
    columnGap: ["spacing"],
    height: ["spacing"],
    maxHeight: ["spacing"],
    maxWidth: ["spacing"],
    minHeight: ["spacing"],
    minWidth: ["spacing"],
    padding: ["spacing"],
    rowGap: ["spacing"],
    width: ["spacing"],
  });
  if (isRecord(value.layout)) {
    validateTokenRefMap(value.layout.inset, `${path}/layout/inset`, diagnostics, tokens, { bottom: ["spacing"], left: ["spacing"], right: ["spacing"], top: ["spacing"] });
  }
  validateTokenRefMap(value.style, `${path}/style`, diagnostics, tokens, {
    backgroundColor: ["color"],
    borderColor: ["color"],
    borderRadius: ["radius"],
    borderWidth: ["border"],
    color: ["color"],
    fontFamily: ["fontFamily"],
    fontSize: ["textSize"],
    shadow: ["shadow"],
  });
  if (isRecord(value.style)) {
    validateTokenRefMap(value.style.gradient, `${path}/style/gradient`, diagnostics, tokens, { from: ["color"], to: ["color"] });
    validateTokenRefMap(value.style.shadow, `${path}/style/shadow`, diagnostics, tokens, { color: ["color"] });
  }
  validateTokenRefMap(value.image, `${path}/image`, diagnostics, tokens, { tint: ["color"] });
}

function validateTokenRefMap(value: unknown, path: string, diagnostics: IIrDiagnostic[], tokens: Map<string, IUiThemeTokenIr>, allowed: Record<string, readonly UiThemeTokenKind[]>): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_TOKEN_REFS_INVALID", message: "UI token reference section must be an object.", path });
    return;
  }
  for (const [field, tokenId] of Object.entries(value)) {
    const kinds = allowed[field];
    if (kinds === undefined) {
      diagnostics.push({ code: "TN_IR_UI_TOKEN_REF_FIELD_UNSUPPORTED", message: `UI token reference field '${field}' is not supported here.`, path: `${path}/${field}` });
      continue;
    }
    if (typeof tokenId !== "string" || tokenId.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_TOKEN_REF_INVALID", message: `UI token reference '${field}' must be a non-empty token id.`, path: `${path}/${field}` });
      continue;
    }
    const token = tokens.get(tokenId);
    if (token === undefined) {
      diagnostics.push({ code: "TN_IR_UI_TOKEN_REF_UNRESOLVED", message: `UI token reference '${field}' points to missing token '${tokenId}'.`, path: `${path}/${field}` });
    } else if (!kinds.includes(token.kind)) {
      diagnostics.push({ code: "TN_IR_UI_TOKEN_REF_KIND_INVALID", message: `UI token reference '${field}' requires ${kinds.join(" or ")} token, got '${token.kind}'.`, path: `${path}/${field}` });
    }
  }
}

function validateTokenString(value: unknown, pattern: RegExp, code: string, message: string, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || !pattern.test(value)) {
    diagnostics.push({ code, message, path });
  }
}

function validateFocusRingToken(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_VALUE_INVALID", message: "focusRing tokens must be objects.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["color", "radius", "width"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_VALUE_INVALID", message: `focusRing token field '${key}' is unsupported.`, path: `${path}/${key}` });
    }
  }
  validateTokenString(value.color, /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "TN_IR_UI_THEME_TOKEN_VALUE_INVALID", "focusRing color must be #RRGGBB or #RRGGBBAA.", `${path}/color`, diagnostics);
  for (const key of ["radius", "width"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
      diagnostics.push({ code: "TN_IR_UI_THEME_TOKEN_VALUE_INVALID", message: `focusRing ${key} must be a finite non-negative number.`, path: `${path}/${key}` });
    }
  }
}

export function validateUiGradient(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
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

export function validateUiShadow(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
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
