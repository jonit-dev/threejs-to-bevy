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

test("ui dom overlay should follow explicit directional navigation links", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const pause = findByUiId(overlay.element, "pause");
  const jump = findByUiId(overlay.element, "jump");

  jump?.dispatchKeyDown({ key: "ArrowLeft" });

  assert.equal(pause?.focused, true);
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

class FakeDocument {
  createElement(tagName: string): HTMLElement {
    return new FakeElement(tagName) as unknown as HTMLElement;
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
  focused = false;
  readonly listeners = new Map<string, Array<(event?: FakeKeyboardEvent) => void>>();
  readonly style: Record<string, string> = {};
  tabIndex = -1;
  textContent = "";
  type = "";

  constructor(readonly tagName: string) {}

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

  dispatchKeyDown(event: FakeKeyboardEvent): void {
    const keyEvent = { preventDefault: () => undefined, shiftKey: false, ...event };
    for (const listener of this.listeners.get("keydown") ?? []) {
      listener(keyEvent);
    }
  }

  focus(): void {
    this.focused = true;
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
