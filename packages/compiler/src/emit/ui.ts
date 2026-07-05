import { captureUi, type IUiElement } from "@threenative/ui";
import type { IUiComponentDefinitionIr, IUiGeneratedNodeProvenanceIr, IUiIr, IUiNodeIr, IUiThemeIr, IUiThemeTokenIr } from "@threenative/ir";

export function emitUi(root: IUiElement, options: { theme?: IUiThemeIr } = {}): IUiIr {
  return lowerUiComposition({
    ...captureUi(root),
    ...(options.theme === undefined ? {} : { theme: options.theme }),
  } as IUiIr);
}

export function lowerUiComposition(ui: IUiIr): IUiIr {
  return resolveUiThemeTokens(expandUiComponents(ui));
}

export function expandUiComponents(ui: IUiIr): IUiIr {
  if (ui.components === undefined || ui.components.length === 0) {
    return ui;
  }
  const components = new Map(ui.components.map((component) => [component.id, component]));
  const provenance: Record<string, IUiGeneratedNodeProvenanceIr> = { ...(ui.generatedNodeProvenance ?? {}) };
  const root = expandNode(ui.root, components, provenance, "root");
  const { components: _components, ...rest } = ui;
  return {
    ...rest,
    generatedNodeProvenance: provenance,
    root,
  };
}

export function resolveUiThemeTokens(ui: IUiIr): IUiIr {
  if (ui.theme === undefined) {
    return ui;
  }
  const tokens = new Map(ui.theme.tokens.map((token) => [token.id, token]));
  return {
    ...ui,
    root: resolveNodeTokens(ui.root as IUiNodeIr, tokens),
  };
}

function resolveNodeTokens(node: IUiNodeIr, tokens: Map<string, IUiThemeTokenIr>): IUiNodeIr {
  const tokenRefs = node.tokenRefs;
  const next: IUiNodeIr = {
    ...node,
    ...(node.children === undefined ? {} : { children: node.children.map((child) => resolveNodeTokens(child, tokens)) }),
  };
  if (tokenRefs === undefined) {
    return next;
  }
  next.layout = {
    ...next.layout,
    ...resolveFlatRefs(tokenRefs.layout, tokens),
    ...(tokenRefs.layout?.inset === undefined ? {} : {
      inset: {
        ...next.layout?.inset,
        ...resolveFlatRefs(tokenRefs.layout.inset, tokens),
      },
    }),
  };
  next.style = {
    ...next.style,
    ...resolveFlatRefs(tokenRefs.style, tokens),
    ...(tokenRefs.style?.gradient === undefined ? {} : {
      gradient: {
        kind: "linear",
        ...next.style?.gradient,
        ...resolveFlatRefs(tokenRefs.style.gradient, tokens),
      },
    }),
    ...(tokenRefs.style?.shadow === undefined ? {} : {
      shadow: {
        color: "#000000",
        ...next.style?.shadow,
        ...resolveFlatRefs(tokenRefs.style.shadow, tokens),
      },
    }),
  } as IUiNodeIr["style"];
  next.image = {
    ...next.image,
    ...resolveFlatRefs(tokenRefs.image, tokens),
  };
  delete next.tokenRefs;
  return next;
}

function expandNode(
  node: IUiNodeIr,
  components: Map<string, IUiComponentDefinitionIr>,
  provenance: Record<string, IUiGeneratedNodeProvenanceIr>,
  sourcePath: string,
): IUiNodeIr {
  if (node.kind === "component" && node.component !== undefined) {
    const component = components.get(node.component.ref);
    if (component === undefined) {
      return node;
    }
    const props = componentProps(component, node.component.props ?? {});
    return expandTemplateNode(component.root, node.id, component.id, props, provenance, `${sourcePath}/component`);
  }
  return {
    ...node,
    ...(node.children === undefined ? {} : { children: node.children.map((child, index) => expandNode(child, components, provenance, `${sourcePath}/children/${index}`)) }),
  };
}

function expandTemplateNode(
  node: IUiNodeIr,
  instanceId: string,
  componentId: string,
  props: Record<string, string | number | boolean>,
  provenance: Record<string, IUiGeneratedNodeProvenanceIr>,
  sourcePath: string,
): IUiNodeIr {
  const expandedId = `${instanceId}.${node.id}`;
  const expanded = substituteNodeProps({
    ...node,
    id: expandedId,
    ...(node.children === undefined ? {} : {
      children: node.children.map((child, index) => expandTemplateNode(child, instanceId, componentId, props, provenance, `${sourcePath}/root/children/${index}`)),
    }),
  }, props);
  provenance[expanded.id] = {
    component: componentId,
    instance: instanceId,
    node: node.id,
    sourcePath,
  };
  return expanded;
}

function componentProps(component: IUiComponentDefinitionIr, provided: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const prop of component.props ?? []) {
    if (prop.defaultValue !== undefined) {
      props[prop.id] = prop.defaultValue;
    }
  }
  return { ...props, ...provided };
}

function substituteNodeProps(node: IUiNodeIr, props: Record<string, string | number | boolean>): IUiNodeIr {
  return substituteValue(node, props) as IUiNodeIr;
}

function substituteValue(value: unknown, props: Record<string, string | number | boolean>): unknown {
  if (typeof value === "string" && value.startsWith("$props.")) {
    return props[value.slice("$props.".length)] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteValue(item, props));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteValue(item, props)]));
  }
  return value;
}

function resolveFlatRefs(refs: Record<string, unknown> | undefined, tokens: Map<string, IUiThemeTokenIr>): Record<string, unknown> {
  if (refs === undefined) {
    return {};
  }
  const resolved: Record<string, unknown> = {};
  for (const [field, tokenId] of Object.entries(refs)) {
    if (typeof tokenId !== "string") {
      continue;
    }
    resolved[field] = resolveTokenValue(tokenId, tokens, []);
  }
  return resolved;
}

function resolveTokenValue(tokenId: string, tokens: Map<string, IUiThemeTokenIr>, seen: string[]): unknown {
  const token = tokens.get(tokenId);
  if (token === undefined) {
    return undefined;
  }
  if (typeof token.value === "object" && token.value !== null && "alias" in token.value && typeof token.value.alias === "string" && !seen.includes(tokenId)) {
    return resolveTokenValue(token.value.alias, tokens, [...seen, tokenId]);
  }
  return token.value;
}
