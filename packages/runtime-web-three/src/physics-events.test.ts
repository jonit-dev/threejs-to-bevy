import assert from "node:assert/strict";
import test from "node:test";

import type { ISystemsIr, IWorldIr } from "@threenative/ir";

import { mapWorld } from "./mapWorld.js";
import { runGameFrame } from "./gameLoop.js";

test("physics should damage entity on collision event", async () => {
  const world: IWorldIr = {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "enemy",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          Health: { value: 10 },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "player",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "kinematic" as const },
          Transform: { position: [0.5, 0, 0] as const },
        },
      },
    ],
  };
  const systems: ISystemsIr = {
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [
      {
        commands: [],
        eventReads: ["CollisionEvent"],
        eventWrites: [],
        name: "damage",
        queries: [{ with: ["Health"], without: [] }],
        reads: ["Health"],
        resourceReads: [],
        resourceWrites: [],
        services: [],
        schedule: "fixedUpdate",
        script: { bundle: "scripts.bundle.js", exportName: "damage" },
        writes: ["Health"],
      },
    ],
  };

  await runGameFrame({
    delta: 1 / 60,
    mapped: mapWorld(emptyBundle(world)),
    module: {
      damage(context: {
        events: { read(event: string): Array<{ a: string; b: string }> };
        query(query: { with: string[]; without: string[] }): Array<{
          get<T>(component: string): T;
          patch(component: string, value: Record<string, unknown>): void;
        }>;
      }) {
        for (const event of context.events.read("CollisionEvent")) {
          const enemy = event.a === "enemy" || event.b === "enemy" ? context.query({ with: ["Health"], without: [] })[0] : undefined;
          if (enemy !== undefined) {
            const health = enemy.get<{ value: number }>("Health");
            enemy.patch("Health", { value: health.value - 1 });
          }
        }
      },
    },
    systems,
    world,
  });

  assert.deepEqual(world.events?.CollisionEvent, [{ a: "enemy", b: "player" }]);
  assert.deepEqual(world.entities[0]?.components.Health, { value: 9 });
});

function emptyBundle(world: Parameters<typeof mapWorld>[0]["world"]): Parameters<typeof mapWorld>[0] {
  return {
    assets: { schema: "threenative.assets", version: "0.1.0", assets: [] },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "physics-events",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: { schema: "threenative.materials", version: "0.1.0", materials: [] },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world,
  };
}
