import assert from "node:assert/strict";
import test from "node:test";
import type { IUiIr, IWorldIr } from "@threenative/ir";

import { createUiDomOverlay } from "./domOverlay.js";
import { renderUi } from "./renderUi.js";

test("richText should render inline spans with declared font family and decoration", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const overlay = createUiDomOverlay(rendered, new FakeDocument() as unknown as Document);
  const title = findByUiId(overlay.element, "title");

  assert.equal(title?.getAttribute("aria-label"), "Paused menu title");
  assert.equal(title?.children.length, 2);
  assert.equal(title?.children[0]?.textContent, "Paused");
  assert.equal(title?.children[0]?.style.fontFamily, "menu");
  assert.equal(title?.children[0]?.style.fontWeight, "bold");
  assert.equal(title?.children[0]?.style.textDecoration, "underline");
  assert.equal(title?.children[1]?.getAttribute("aria-label"), " exclamation mark");
});

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    fonts: [{ asset: "assets/fonts/menu.ttf", family: "menu" }],
    root: {
      id: "title",
      kind: "text",
      accessibilityLabel: "Paused menu title",
      spans: [
        { text: "Paused", color: "#ffffff", decoration: "underline", fontFamily: "menu", fontSize: 24, weight: "bold" },
        { text: "!", accessibilityText: " exclamation mark", fontFamily: "menu", italic: true },
      ],
    },
  };
}

function makeWorld(): IWorldIr {
  return { entities: [], resources: {}, schema: "threenative.world", version: "0.1.0" };
}

function findByUiId(root: HTMLElement, id: string): FakeElement | undefined {
  return find(root as unknown as FakeElement, (element) => element.dataset.threenativeUiId === id);
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
    return new FakeElement(tagName, this) as unknown as HTMLElement;
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = { add: (...tokens: string[]) => this.classNames.push(...tokens) };
  readonly classNames: string[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Array<(event?: { preventDefault(): void }) => void>>();
  readonly style: Record<string, string> = {};
  tabIndex = -1;
  textContent = "";
  type = "";

  constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}

  addEventListener(type: string, listener: (event?: { preventDefault(): void }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  click(): void {}

  focus(): void {}

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(): FakeElement | null {
    return null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}
