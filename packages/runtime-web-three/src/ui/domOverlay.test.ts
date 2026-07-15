import assert from "node:assert/strict";
import test from "node:test";

import type { IUiIr, IWorldIr } from "@threenative/ir";

import { createUiDomOverlay } from "./domOverlay.js";
import { renderUi } from "./renderUi.js";

test("ui dom overlay should sync resource bindings into text and bar elements", () => {
  const world = makeWorld();
  const rendered = renderUi(makeUi(), world);
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);

  assert.equal(findByUiId(overlay.element, "score")?.textContent, "3");
  assert.equal(findByUiId(overlay.element, "health")?.getAttribute("aria-valuenow"), "10");
  assert.equal(findByFillId(overlay.element, "health")?.style.width, "50%");

  world.resources = { Health: { current: 5 }, Score: 9 };
  overlay.update();

  assert.equal(findByUiId(overlay.element, "score")?.textContent, "9");
  assert.equal(findByUiId(overlay.element, "health")?.getAttribute("aria-valuenow"), "5");
  assert.equal(findByFillId(overlay.element, "health")?.style.width, "25%");
});

test("ui dom overlay should render minimap canvas nodes", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const minimap = findByUiId(overlay.element, "minimap");

  assert.equal(minimap?.tagName, "canvas");
  assert.equal(minimap?.getAttribute("role"), "img");
  assert.equal(minimap?.getAttribute("aria-label"), "Race minimap");
  assert.equal(minimap?.style.width, "120px");
  assert.equal(minimap?.style.height, "80px");
});

test("ui dom overlay should resolve image paths against the loaded bundle", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document, "/bundle");

  assert.equal(findByUiId(overlay.element, "portrait")?.getAttribute("src"), "/bundle/assets/hero.png");
});

test("ui dom overlay should dispatch button and touch control clicks to rendered actions", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);

  findByUiId(overlay.element, "pause")?.click();
  findByUiId(overlay.element, "jump")?.click();

  assert.deepEqual(rendered.actions, [
    { action: "Pause", node: "pause" },
    { action: "Jump", node: "jump" },
  ]);
});

test("ui dom overlay should dispatch text input values in order", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const input = findByUiId(overlay.element, "player-name");

  assert.equal(input?.tagName, "input");
  assert.equal(input?.type, "text");
  assert.equal(input?.getAttribute("role"), "textbox");
  assert.equal(input?.value, "Hero");

  input?.setValue("He");
  input?.setValue("Heroine");

  assert.deepEqual(rendered.actions, [
    { action: "SetPlayerName", node: "player-name", value: "He" },
    { action: "SetPlayerName", node: "player-name", value: "Heroine" },
  ]);
});

test("ui dom overlay should reflect script-driven disabled and value state", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const pause = findByUiId(overlay.element, "pause");
  const volume = findByUiId(overlay.element, "volume");

  rendered.setDisabled("pause", true);
  rendered.setValue("volume", 0.75);
  overlay.update();

  assert.equal(pause?.disabled, true);
  assert.equal(pause?.getAttribute("aria-disabled"), "true");
  assert.equal(volume?.value, "0.75");
  assert.equal(volume?.getAttribute("aria-valuenow"), "0.75");

  rendered.setDisabled("pause", false);
  overlay.update();

  assert.equal(pause?.disabled, false);
  assert.equal(pause?.getAttribute("aria-disabled"), null);
});

test("ui dom overlay should render effect presets for interaction and bound states", () => {
  const ui = makeUi();
  ui.root.children?.push(
    {
      effects: [
        { color: "#ffd54a", fallback: "shadow", id: "hover.glow", kind: "glow", radius: 12, trigger: "hover" },
        { color: "#ffffff", id: "focus.ring", intensity: 3, kind: "focusRing", radius: 2, trigger: "focus" },
      ],
      focusable: true,
      id: "effect-target",
      kind: "button",
      label: "Effects",
    },
    {
      binding: { kind: "resource", name: "Selected" },
      effects: [{ color: "#66ccff", id: "selected.outline", kind: "outline", trigger: "selected" }],
      id: "selected-target",
      kind: "row",
    },
    {
      binding: { kind: "resource", name: "Selected" },
      effects: [{ color: "#ff0033", id: "selected.tint", kind: "tint", trigger: "selected" }],
      id: "tint-target",
      kind: "row",
      style: { backgroundColor: "#101820" },
    },
    {
      effects: [{ color: "#ff4466", id: "danger.pulse", kind: "pulse", predicate: { field: "danger", resource: "UiState", equals: true }, pulse: { durationMs: 600, iterations: 2 }, trigger: "predicate" }],
      id: "predicate-target",
      kind: "row",
    },
  );
  const world = makeWorld();
  world.resources = { ...world.resources, Selected: true, UiState: { danger: true } };
  const overlay = createUiDomOverlay(renderUi(ui, world), new FakeDocument() as unknown as Document);
  const interactive = findByUiId(overlay.element, "effect-target");

  interactive?.dispatch("pointerenter");
  assert.equal(interactive?.style.boxShadow, "0 0 12px 3px #ffd54a");
  interactive?.dispatch("pointerleave");
  assert.equal(interactive?.style.boxShadow, "");
  interactive?.dispatch("focus");
  assert.equal(interactive?.style.outline, "3px solid #ffffff");
  assert.equal(interactive?.style.outlineOffset, "2px");
  assert.equal(findByUiId(overlay.element, "selected-target")?.style.outline, "2px solid #66ccff");
  assert.equal(findByUiId(overlay.element, "tint-target")?.style.backgroundColor, "color-mix(in srgb, #101820, #ff0033 50%)");
  assert.equal(findByUiId(overlay.element, "predicate-target")?.style.animation, "tn-ui-effect-pulse 600ms ease-in-out 2 alternate");
});

test("ui dom overlay should navigate focus with tab keys and activate focused controls", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const pause = findByUiId(overlay.element, "pause");
  const jump = findByUiId(overlay.element, "jump");

  pause?.dispatchKeyDown({ key: "Tab" });
  assert.equal(jump?.focused, true);

  jump?.dispatchKeyDown({ key: " " });
  jump?.dispatchKeyDown({ key: "Tab", shiftKey: true });

  assert.equal(pause?.focused, true);
  assert.deepEqual(rendered.actions, [{ action: "Jump", node: "jump" }]);
});

test("ui dom overlay should skip disabled explicit navigation targets", () => {
  const ui = makeUi();
  const controls = ui.root.children?.find((node) => node.id === "controls");
  const pause = controls?.children?.find((node) => node.id === "pause");
  const jump = controls?.children?.find((node) => node.id === "jump");
  if (pause !== undefined) pause.navigation = { right: "jump" };
  if (jump !== undefined) jump.disabled = true;
  const rendered = renderUi(ui, makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const pauseElement = findByUiId(overlay.element, "pause");
  const nameInput = findByUiId(overlay.element, "player-name");

  pauseElement?.dispatchKeyDown({ key: "ArrowRight" });

  assert.equal(nameInput?.focused, true);
});

test("ui dom overlay should follow explicit directional navigation links", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const pause = findByUiId(overlay.element, "pause");
  const jump = findByUiId(overlay.element, "jump");

  jump?.dispatchKeyDown({ key: "ArrowLeft" });

  assert.equal(pause?.focused, true);
});

test("ui dom overlay should apply safe-area avoidance and clamp context menus to the viewport", () => {
  const ui = makeUi();
  ui.safeArea = { edges: ["top", "right", "bottom", "left"], mode: "avoid" };
  ui.root.children?.push(
    { id: "menu-anchor", kind: "button", action: "OpenMenu", label: "Menu" },
    {
      id: "slot-menu",
      kind: "contextMenu",
      anchorId: "menu-anchor",
      children: [{ id: "menu-action", kind: "button", action: "Inspect", label: "Inspect" }],
    },
  );
  const document = new FakeDocument();
  const rendered = renderUi(ui, makeWorld());
  const overlay = createUiDomOverlay(rendered, document as unknown as Document);
  const slot = findByUiId(overlay.element, "menu-anchor");
  const menu = findByUiId(overlay.element, "slot-menu");

  assert.equal(overlay.element.style.paddingTop, "env(safe-area-inset-top)");
  assert.equal(overlay.element.style.paddingRight, "env(safe-area-inset-right)");
  assert.equal(overlay.element.style.paddingBottom, "env(safe-area-inset-bottom)");
  assert.equal(overlay.element.style.paddingLeft, "env(safe-area-inset-left)");

  menu!.rect = { bottom: 0, height: 120, left: 0, top: 0, width: 160 };
  slot!.rect = { bottom: 590, height: 24, left: 790, top: 566, width: 80 };
  slot!.click();

  assert.equal(menu?.style.left, "640px");
  assert.equal(menu?.style.top, "480px");
});

test("ui dom overlay should apply explicit flex layout metadata", () => {
  const overlay = createUiDomOverlay(renderUi(makeUi(), makeWorld()), new FakeDocument() as unknown as Document);
  const controls = findByUiId(overlay.element, "controls");
  const portrait = findByUiId(overlay.element, "portrait");
  const pause = findByUiId(overlay.element, "pause");
  const spacer = findByUiId(overlay.element, "spacer");
  const inventory = findByUiId(overlay.element, "inventory");

  assert.equal(controls?.style.display, "flex");
  assert.equal(controls?.style.flexDirection, "row");
  assert.equal(controls?.style.justifyContent, "space-between");
  assert.equal(controls?.style.alignItems, "center");
  assert.equal(controls?.style.columnGap, "12px");
  assert.equal(controls?.style.rowGap, "4px");
  assert.equal(controls?.style.padding, "6px");
  assert.equal(controls?.style.position, "absolute");
  assert.equal(controls?.style.left, "24px");
  assert.equal(controls?.style.top, "16px");
  assert.equal(controls?.style.width, "320px");
  assert.equal(controls?.style.height, "48px");
  assert.equal(controls?.style.maxWidth, "480px");
  assert.equal(controls?.style.minHeight, "24px");
  assert.equal(controls?.style.overflowX, "hidden");
  assert.equal(controls?.style.overflowY, "auto");
  assert.equal(controls?.style.zIndex, "5");
  assert.equal(controls?.style.backgroundColor, "#101820cc");
  assert.equal(controls?.style.borderColor, "#ffffff");
  assert.equal(controls?.style.borderRadius, "8px");
  assert.equal(controls?.style.borderStyle, "solid");
  assert.equal(controls?.style.borderWidth, "2px");
  assert.equal(controls?.style.color, "#ffcc00");
  assert.equal(controls?.style.fontSize, "18px");
  assert.equal(controls?.style.fontWeight, "bold");
  assert.equal(controls?.style.background, "linear-gradient(90deg, #101820, #203040)");
  assert.equal(controls?.style.boxShadow, "0px 4px 12px 1px #00000080");
  assert.equal(controls?.style.opacity, "0.75");
  assert.equal(controls?.style.overflowWrap, "normal");
  assert.equal(controls?.style.textAlign, "center");
  assert.equal(controls?.style.textDecoration, "underline");
  assert.equal(controls?.style.whiteSpace, "normal");
  assert.equal(portrait?.tagName, "img");
  assert.equal(portrait?.getAttribute("alt"), "Hero portrait");
  assert.equal(portrait?.getAttribute("role"), "image");
  assert.equal(portrait?.getAttribute("src"), "assets/hero.png");
  assert.equal(portrait?.style.objectFit, "contain");
  assert.equal(pause?.getAttribute("aria-label"), "Pause menu");
  assert.equal(pause?.style.flexGrow, "1");
  assert.equal(spacer?.getAttribute("role"), "presentation");
  assert.equal(spacer?.getAttribute("aria-label"), null);
  assert.equal(inventory?.style.display, "grid");
  assert.equal(inventory?.style.gridAutoFlow, "row");
  assert.equal(inventory?.style.gridTemplateColumns, "repeat(3, minmax(0, 1fr))");
  assert.equal(inventory?.style.gridTemplateRows, "repeat(2, minmax(0, 1fr))");
});

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "hud",
      kind: "column",
      children: [
        { id: "score", kind: "text", binding: { kind: "resource", name: "Score" } },
        { id: "health", kind: "bar", max: 20, binding: { kind: "resource", name: "Health", field: "current" } },
        {
          id: "minimap",
          kind: "minimap",
          accessibilityLabel: "Race minimap",
          layout: { width: 120, height: 80 },
          minimap: {
            bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
            paths: [{ points: [[-8, -3], [0, 4], [8, -3], [-8, -3]], color: "#94a3b8", width: 4 }],
            markers: [{ x: 0, z: 0, color: "#f97316", label: "P" }],
          },
        },
        {
          id: "controls",
          kind: "row",
          layout: { align: "center", columnGap: 12, direction: "row", height: 48, inset: { left: 24, top: 16 }, justify: "spaceBetween", maxWidth: 480, minHeight: 24, overflow: "scroll", padding: 6, position: "absolute", rowGap: 4, width: 320, zIndex: 5 },
          style: { backgroundColor: "#101820cc", borderColor: "#ffffff", borderRadius: 8, borderWidth: 2, color: "#ffcc00", fontSize: 18, fontWeight: "bold", gradient: { angle: 90, from: "#101820", kind: "linear", to: "#203040" }, opacity: 0.75, shadow: { blur: 12, color: "#00000080", offsetX: 0, offsetY: 4, spread: 1 }, textAlign: "center", textDecoration: "underline", wrap: "word" },
          children: [
            { id: "pause", kind: "button", accessibilityLabel: "Pause menu", label: "Pause", action: "Pause", layout: { grow: 1 }, navigation: { right: "jump" } },
            { id: "portrait", kind: "image", accessibilityLabel: "Hero portrait", role: "image", src: "assets/hero.png" },
            { id: "spacer", kind: "row", accessibilityLabel: "Decorative spacer", role: "none" },
            { id: "jump", kind: "touchControl", label: "Jump", action: "Jump", navigation: { left: "pause" } },
            { id: "player-name", kind: "textInput", label: "Player name", action: "SetPlayerName", text: "Hero" },
            { id: "volume", kind: "slider", label: "Volume", action: "SetVolume", min: 0, max: 1, value: 0.25, step: 0.05 },
          ],
        },
        {
          id: "inventory",
          kind: "column",
          layout: { columnGap: 6, grid: { autoFlow: "row", columns: 3, rows: 2 }, rowGap: 6 },
          children: [
            { id: "slot-1", kind: "image", accessibilityLabel: "Potion", role: "image", src: "assets/potion.png" },
            { id: "slot-2", kind: "image", accessibilityLabel: "Key", role: "image", src: "assets/key.png" },
          ],
        },
      ],
    },
  };
}

function makeWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [],
    resources: { Health: { current: 10 }, Score: 3 },
  };
}

function findByUiId(root: HTMLElement, id: string): FakeElement | undefined {
  return find(root as unknown as FakeElement, (element) => element.dataset.threenativeUiId === id);
}

function findByFillId(root: HTMLElement, id: string): FakeElement | undefined {
  return find(root as unknown as FakeElement, (element) => element.dataset.threenativeUiBarFill === id);
}

function find(element: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement | undefined {
  if (predicate(element)) {
    return element;
  }
  for (const child of element.children) {
    const found = find(child, predicate);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findAll(element: FakeElement, predicate: (element: FakeElement) => boolean, matches: FakeElement[]): void {
  if (predicate(element)) {
    matches.push(element);
  }
  for (const child of element.children) {
    findAll(child, predicate, matches);
  }
}

class FakeDocument {
  readonly defaultView = { innerHeight: 600, innerWidth: 800 };
  readonly documentElement = { clientHeight: 600, clientWidth: 800 };

  createElement(tagName: string): HTMLElement {
    return new FakeElement(tagName, this) as unknown as HTMLElement;
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = {
    add: (...tokens: string[]) => {
      this.classNames.push(...tokens);
    },
  };
  readonly classNames: string[] = [];
  readonly dataset: Record<string, string> = {};
  disabled = false;
  focused = false;
  readonly listeners = new Map<string, Array<(event?: FakeKeyboardEvent) => void>>();
  readonly style: Record<string, string> = {};
  tabIndex = -1;
  textContent = "";
  type = "";
  value = "";
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "top" | "width"> = { bottom: 0, height: 0, left: 0, top: 0, width: 0 };

  constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}

  get width(): number {
    return Number(this.attributes.get("width") ?? 0);
  }

  set width(value: number) {
    this.attributes.set("width", String(value));
  }

  get height(): number {
    return Number(this.attributes.get("height") ?? 0);
  }

  set height(value: number) {
    this.attributes.set("height", String(value));
  }

  getContext(): FakeCanvasContext | null {
    return this.tagName === "canvas" ? new FakeCanvasContext() : null;
  }

  get offsetHeight(): number {
    return this.rect.height;
  }

  get offsetWidth(): number {
    return this.rect.width;
  }

  addEventListener(type: string, listener: (event?: FakeKeyboardEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) {
      listener();
    }
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  setValue(value: string): void {
    this.value = value;
    for (const listener of this.listeners.get("input") ?? []) {
      listener();
    }
  }

  dispatchKeyDown(event: FakeKeyboardEvent): void {
    const keyEvent = { preventDefault: () => undefined, shiftKey: false, ...event };
    for (const listener of this.listeners.get("keydown") ?? []) {
      listener(keyEvent);
    }
  }

  focus(): void {
    this.focused = true;
  }

  getBoundingClientRect(): Pick<DOMRect, "bottom" | "height" | "left" | "top" | "width"> {
    return this.rect;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector !== "[data-threenative-ui-bar-fill]") {
      return null;
    }
    return find(this, (element) => element.dataset.threenativeUiBarFill !== undefined) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== "[tabindex=\"0\"]") {
      return [];
    }
    const matches: FakeElement[] = [];
    findAll(this, (element) => element.tabIndex === 0, matches);
    return matches;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeCanvasContext {
  fillStyle = "";
  font = "";
  lineCap = "";
  lineJoin = "";
  lineWidth = 1;
  strokeStyle = "";
  arc(): void {}
  beginPath(): void {}
  clearRect(): void {}
  fill(): void {}
  fillRect(): void {}
  fillText(): void {}
  lineTo(): void {}
  moveTo(): void {}
  restore(): void {}
  save(): void {}
  scale(): void {}
  stroke(): void {}
}

interface FakeKeyboardEvent {
  key: string;
  preventDefault?: () => void;
  shiftKey?: boolean;
}
