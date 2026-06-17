import assert from "node:assert/strict";
import test from "node:test";
import type { IUiIr, IWorldIr } from "@threenative/ir";

import { createUiDomOverlay } from "./domOverlay.js";
import { renderUi } from "./renderUi.js";

test("widgets should dispatch slider value change through ui action queue", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  const document = new FakeDocument();
  const overlay = createUiDomOverlay(rendered, document as unknown as Document);
  const volume = findByUiId(overlay.element, "volume");
  const frame = findByUiId(overlay.element, "frame");
  const slot = findByUiId(overlay.element, "slot");
  const menu = findByUiId(overlay.element, "slot-menu");
  const equip = findByUiId(overlay.element, "equip");
  const disabledDrop = findByUiId(overlay.element, "drop");

  assert.equal(volume?.tagName, "input");
  assert.equal(volume?.getAttribute("role"), "slider");
  assert.equal(volume?.getAttribute("aria-valuenow"), "0.5");
  assert.equal(menu?.dataset.threenativeUiOpen, "false");
  assert.equal(frame?.dataset.threenativeUiAtlas, "4,8,32,16");
  assert.equal(frame?.dataset.threenativeUiNineSlice, "4,4,4,4");
  assert.equal(frame?.style.objectFit, "fill");
  assert.equal(frame?.style.transform, "scaleX(-1)");
  volume!.value = "0.75";
  volume!.dispatchInput();
  slot!.dispatchClick();
  assert.equal(menu?.dataset.threenativeUiOpen, "true");
  disabledDrop!.dispatchClick();
  equip!.dispatchClick();

  assert.deepEqual(rendered.actions, [
    { action: "SetVolume", node: "volume", value: 0.75 },
    { action: "Equip", node: "equip" },
  ]);
  assert.equal(menu?.dataset.threenativeUiOpen, "false");
});

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "settings",
      kind: "column",
      children: [
        {
          id: "volume",
          kind: "slider",
          accessibilityLabel: "Volume",
          action: "SetVolume",
          min: 0,
          max: 1,
          step: 0.05,
          value: 0.5,
          valueText: "50 percent",
        },
        {
          id: "frame",
          kind: "image",
          src: "assets/ui/frame.png",
          accessibilityLabel: "Inventory frame",
          image: {
            atlas: { x: 4, y: 8, width: 32, height: 16 },
            flipX: true,
            nineSlice: { top: 4, right: 4, bottom: 4, left: 4 },
            scaleMode: "stretch",
            sourceSize: { width: 64, height: 32 },
          },
        },
        {
          id: "slot",
          kind: "button",
          accessibilityLabel: "Open item actions",
          label: "Item",
        },
        {
          id: "slot-menu",
          kind: "contextMenu",
          anchorId: "slot",
          accessibilityLabel: "Item actions",
          children: [
            {
              id: "equip",
              kind: "button",
              action: "Equip",
              focusable: true,
              label: "Equip",
            },
            {
              id: "drop",
              kind: "button",
              action: "Drop",
              disabled: true,
              focusable: true,
              label: "Drop",
            },
          ],
        },
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
  readonly listeners = new Map<string, Array<(event: { target: FakeElement }) => void>>();

  addEventListener(type: string, listener: (event: { target: FakeElement }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  createElement(tagName: string): HTMLElement {
    return new FakeElement(tagName, this) as unknown as HTMLElement;
  }

  dispatch(type: string, target: FakeElement): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ target });
    }
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = { add: (...tokens: string[]) => this.classNames.push(...tokens) };
  readonly classNames: string[] = [];
  readonly dataset: Record<string, string> = {};
  disabled = false;
  readonly listeners = new Map<string, Array<(event: { target: FakeElement }) => void>>();
  max = "";
  min = "";
  readonly style: Record<string, string> = {};
  step = "";
  tabIndex = -1;
  textContent = "";
  type = "";
  value = "";

  constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}

  addEventListener(type: string, listener: (event: { target: FakeElement }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  contains(target: FakeElement): boolean {
    return this === target || this.children.some((child) => child.contains(target));
  }

  dispatchClick(): void {
    for (const listener of this.listeners.get("click") ?? []) {
      listener({ target: this });
    }
    this.ownerDocument.dispatch("click", this);
  }

  dispatchInput(): void {
    for (const listener of this.listeners.get("input") ?? []) {
      listener({ target: this });
    }
  }

  focus(): void {}

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(): FakeElement | null {
    return null;
  }

  querySelectorAll(): FakeElement[] {
    const matches: FakeElement[] = [];
    for (const child of this.children) {
      if (child.tabIndex === 0) {
        matches.push(child);
      }
      matches.push(...child.querySelectorAll());
    }
    return matches;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getBoundingClientRect(): Pick<DOMRect, "bottom" | "left"> {
    return { bottom: 48, left: 16 };
  }
}
