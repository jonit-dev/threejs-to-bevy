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
  assert.equal(controls?.style.opacity, "0.75");
  assert.equal(controls?.style.overflowWrap, "normal");
  assert.equal(controls?.style.textAlign, "center");
  assert.equal(controls?.style.whiteSpace, "normal");
  assert.equal(portrait?.tagName, "img");
  assert.equal(portrait?.getAttribute("alt"), "Hero portrait");
  assert.equal(portrait?.getAttribute("role"), "image");
  assert.equal(portrait?.getAttribute("src"), "assets/hero.png");
  assert.equal(portrait?.style.objectFit, "contain");
  assert.equal(pause?.getAttribute("aria-label"), "Pause menu");
  assert.equal(pause?.style.flexGrow, "1");
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
          id: "controls",
          kind: "row",
          layout: { align: "center", columnGap: 12, direction: "row", height: 48, inset: { left: 24, top: 16 }, justify: "spaceBetween", maxWidth: 480, minHeight: 24, overflow: "scroll", padding: 6, position: "absolute", rowGap: 4, width: 320, zIndex: 5 },
          style: { backgroundColor: "#101820cc", borderColor: "#ffffff", borderRadius: 8, borderWidth: 2, color: "#ffcc00", fontSize: 18, opacity: 0.75, textAlign: "center", wrap: "word" },
          children: [
            { id: "pause", kind: "button", accessibilityLabel: "Pause menu", label: "Pause", action: "Pause", layout: { grow: 1 }, navigation: { right: "jump" } },
            { id: "portrait", kind: "image", accessibilityLabel: "Hero portrait", role: "image", src: "assets/hero.png" },
            { id: "jump", kind: "touchControl", label: "Jump", action: "Jump", navigation: { left: "pause" } },
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

interface FakeKeyboardEvent {
  key: string;
  preventDefault?: () => void;
  shiftKey?: boolean;
}
