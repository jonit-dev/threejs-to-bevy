export interface IUiRecipeBuildOptions {
  actions?: Record<string, string>;
  bindings?: Record<string, string>;
  props?: Record<string, unknown>;
}

export interface IUiRecipeBuildResult {
  bindings: Array<{ node: string; resource: string }>;
  components: Array<Record<string, unknown>>;
  focusOrder: string[];
  id: string;
  nodes: Array<Record<string, unknown> & { id: string }>;
  provenance: Record<string, unknown>;
  screens: Array<Record<string, unknown> & { id: string }>;
}

export function buildUiSourceRecipe(recipe: string, id: string, options: IUiRecipeBuildOptions): IUiRecipeBuildResult {
  if (recipe === "inventory-grid") {
    const visibleCount = boundedRecipeCount(options.props?.items, 8);
    const totalCount = Math.max(visibleCount, requestedRecipeCount(options.props?.items, visibleCount));
    const slots = Array.from({ length: visibleCount }, (_, index) => ({
      id: `${id}.slot.${index + 1}`,
      type: "button",
      label: `Slot ${index + 1}`,
      action: options.actions?.inspect ?? "inventory.inspect",
      layout: { width: 96, height: 96 },
    }));
    const root = {
      id,
      type: "column",
      label: "Inventory",
      layout: { anchor: "center", padding: 16 },
      responsive: responsiveRules({ desktop: { width: 640 }, mobile: { width: 320 }, tablet: { width: 520 } }),
      ...(totalCount > visibleCount ? { virtualRange: { buffer: 2, itemCount: totalCount, itemExtent: 104, orientation: "vertical", viewportExtent: 416 } } : {}),
    };
    return recipeOutput(id, recipe, [root, ...slots], slots.map((slot) => slot.id), options, [
      { id: `${id}.slot`, props: [{ id: "label", required: true }], root: { id: "root", kind: "button", label: "$props.label" } },
    ]);
  }
  if (recipe === "settings-list") {
    const rows = ["audio", "video", "controls"].map((name) => ({
      id: `${id}.${name}`,
      type: "button",
      label: `${capitalize(name)} settings`,
      action: options.actions?.[name] ?? `settings.${name}`,
    }));
    return recipeOutput(
      id,
      recipe,
      [
        {
          id,
          type: "column",
          label: "Settings",
          layout: { anchor: "center", padding: 16, width: 360 },
          responsive: responsiveRules({ desktop: { width: 420 }, mobile: { width: 320 }, tablet: { width: 380 } }),
        },
        ...rows,
      ],
      rows.map((row) => row.id),
      options,
    );
  }
  if (attachedUiRecipeKinds.has(recipe)) {
    return attachedUiSourceRecipe(recipe, id, options);
  }
  const defaults: Record<string, { children: string[]; label: string; role: string }> = {
    "dialog-box": { children: ["message", "confirm", "cancel"], label: "Dialog Box", role: "dialog" },
    "hud-status-cluster": { children: ["health", "score"], label: "HUD Status Cluster", role: "hud" },
    "item-detail-panel": { children: ["title", "description", "use"], label: "Item Detail Panel", role: "overlay" },
    "loading-overlay": { children: ["message", "progress"], label: "Loading Overlay", role: "loading" },
    "notification-toast": { children: ["message"], label: "Notification Toast", role: "overlay" },
    "pause-menu": { children: ["resume", "settings", "quit"], label: "Pause Menu", role: "menu" },
  };
  const preset = defaults[recipe] ?? defaults["pause-menu"]!;
  const children = preset.children.map((child) => ({ id: `${id}.${child}`, type: child === "progress" ? "bar" : "button", label: recipeNodeLabel(child), action: options.actions?.[child] ?? `${id}.${child}` }));
  return recipeOutput(id, recipe, [{ id, type: "column", label: preset.label, layout: { anchor: preset.role === "hud" ? "top-left" : "center", padding: 12 } }, ...children], children.map((child) => child.id), options, [], preset.role);
}

export function mergeById(existing: unknown[], next: Array<Record<string, unknown> & { id?: unknown }>): Array<unknown> {
  const merged = existing.filter(isRecord).map((entry) => ({ ...entry }));
  for (const item of next) {
    if (typeof item.id !== "string") {
      continue;
    }
    const target = merged.find((entry) => entry.id === item.id);
    if (target === undefined) {
      merged.push({ ...item });
    } else {
      Object.assign(target, item);
    }
  }
  return merged;
}

const attachedUiRecipeKinds = new Set(["nameplate", "enemy-health-bar", "interact-prompt", "pickup-label", "quest-marker", "off-screen-indicator"]);

function attachedUiSourceRecipe(recipe: string, id: string, options: IUiRecipeBuildOptions): IUiRecipeBuildResult {
  const targetId = typeof options.props?.targetId === "string" ? options.props.targetId : typeof options.props?.entityId === "string" ? options.props.entityId : "target";
  const label = typeof options.props?.label === "string" ? options.props.label : recipeNodeLabel(recipe);
  const attachTo = {
    target: { kind: "entity", id: targetId },
    anchor: "top-center",
    localOffset: [0, 1.4, 0],
    ...(recipe === "off-screen-indicator" ? { clamp: "screenEdge" } : {}),
  };
  const child =
    recipe === "enemy-health-bar"
      ? { id: `${id}.bar`, type: "bar", label: "Health", value: typeof options.props?.value === "number" ? options.props.value : 1, layout: { width: 96, height: 8 } }
      : {
          id: `${id}.label`,
          type: recipe === "interact-prompt" ? "button" : "text",
          label,
          text: label,
          action: options.actions?.interact ?? options.actions?.select ?? `${id}.select`,
        };
  return recipeOutput(
    id,
    recipe,
    [
      { id, type: "column", label: recipeNodeLabel(recipe), attachTo, layout: { anchor: "center", padding: 6 } },
      child,
    ],
    recipe === "interact-prompt" ? [`${id}.label`] : [],
    options,
    [],
    "hud",
  );
}

function recipeOutput(
  id: string,
  recipe: string,
  nodes: Array<Record<string, unknown> & { id: string }>,
  focusOrder: string[],
  options: IUiRecipeBuildOptions,
  components: Array<Record<string, unknown>> = [],
  role = "menu",
): IUiRecipeBuildResult {
  return {
    bindings: Object.entries(options.bindings ?? {}).map(([node, resource]) => ({ node: node.includes(".") ? node : `${id}.${node}`, resource })),
    components,
    focusOrder,
    id,
    nodes,
    provenance: { [`recipes/${id}`]: { kind: recipe, source: "tn.ui.recipe", version: 1 } },
    screens: [{ id, role, root: id, stackPolicy: role === "hud" ? "overlay" : "push", focusScope: { entry: focusOrder[0] ?? id, backAction: options.actions?.back ?? "ui.back", inputCapture: role === "hud" ? "none" : "keyboard", restore: "previous" } }],
  };
}

function boundedRecipeCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(32, Math.trunc(value))) : fallback;
}

function requestedRecipeCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;
}

function responsiveRules(layouts: Record<"desktop" | "mobile" | "tablet", Record<string, unknown>>): Array<{ layout: Record<string, unknown>; target: "desktop" | "mobile" | "tablet" }> {
  return (["desktop", "mobile", "tablet"] as const).map((target) => ({ target, layout: layouts[target] }));
}

function recipeNodeLabel(value: string): string {
  return value.split("-").map(capitalize).join(" ");
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase()}${value.slice(1)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
