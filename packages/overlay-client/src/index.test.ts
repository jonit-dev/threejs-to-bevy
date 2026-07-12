import assert from "node:assert/strict";
import test from "node:test";

import { createOverlayClient } from "./index.js";

test("should deliver retained snapshot exactly once when bridge becomes ready after subscribe", () => {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const windowRef = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) { const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set); },
  } as unknown as Window & { threenativeOverlayBridge?: { send(): boolean; subscribe(listener: (type: string, payload: Record<string, unknown>, metadata: { sequence: number }) => void): () => void } };
  const client = createOverlayClient<{ "hud:snapshot": { score: number } }, Record<string, never>>(windowRef);
  const received: number[] = [];
  client.subscribe("hud:snapshot", (payload) => received.push(payload.score));
  windowRef.threenativeOverlayBridge = { send: () => true, subscribe(listener) { listener("hud:snapshot", { score: 7 }, { sequence: 3 }); return () => {}; } };
  for (const listener of listeners.get("threenative:bridge-ready") ?? []) (listener as EventListener)(new Event("threenative:bridge-ready"));
  for (const listener of listeners.get("threenative:bridge-ready") ?? []) (listener as EventListener)(new Event("threenative:bridge-ready"));
  assert.deepEqual(received, [7]);
});

test("exposes compile-time message contracts", () => {
  const client = createOverlayClient<{ "hud:snapshot": { score: number } }, { "hud:action": { action: string } }>({ addEventListener() {} } as unknown as Window);
  if (false) {
    // @ts-expect-error undeclared messages must not typecheck
    client.send("hud:typo", { action: "confirm" });
    // @ts-expect-error declared payload fields retain their types
    client.send("hud:action", { action: 3 });
  }
  assert.equal(typeof client.send, "function");
});
