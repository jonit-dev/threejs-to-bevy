import assert from "node:assert/strict";
import test from "node:test";

import { defineQuery } from "./ecs/query.js";
import { SdkError } from "./errors.js";
import { scriptLifecycle } from "./scriptLifecycle.js";

test("should lower lifecycle exports to portable schedules", () => {
  const systems = scriptLifecycle({
    after: ["input"],
    awake: "awakeRally",
    fixedUpdate: "fixedUpdateRally",
    id: "rally",
    lateUpdate: "lateUpdateRally",
    module: "src/scripts/rally.ts",
    queries: [defineQuery({ with: ["Transform"], orderBy: "id" })],
    reads: ["Transform"],
    resourceWrites: ["RallyState"],
    services: ["scene.current"],
    update: "updateRally",
    writes: ["Transform"],
  });

  assert.deepEqual(
    systems.map((system) => ({
      after: system.after,
      exportName: system.script?.export,
      module: system.script?.module,
      name: system.name,
      queries: system.queries.map((query) => ({ orderBy: query.orderBy, with: query.with })),
      resourceWrites: system.resourceWrites,
      schedule: system.schedule,
      services: system.services,
      writes: system.writes,
    })),
    [
      {
        after: ["input"],
        exportName: "awakeRally",
        module: "src/scripts/rally.ts",
        name: "rally.awake",
        queries: [{ orderBy: "id", with: ["Transform"] }],
        resourceWrites: ["RallyState"],
        schedule: "startup",
        services: ["scene.current"],
        writes: ["Transform"],
      },
      {
        after: ["input"],
        exportName: "fixedUpdateRally",
        module: "src/scripts/rally.ts",
        name: "rally.fixedUpdate",
        queries: [{ orderBy: "id", with: ["Transform"] }],
        resourceWrites: ["RallyState"],
        schedule: "fixedUpdate",
        services: ["scene.current"],
        writes: ["Transform"],
      },
      {
        after: ["input"],
        exportName: "updateRally",
        module: "src/scripts/rally.ts",
        name: "rally.update",
        queries: [{ orderBy: "id", with: ["Transform"] }],
        resourceWrites: ["RallyState"],
        schedule: "update",
        services: ["scene.current"],
        writes: ["Transform"],
      },
      {
        after: ["input"],
        exportName: "lateUpdateRally",
        module: "src/scripts/rally.ts",
        name: "rally.lateUpdate",
        queries: [{ orderBy: "id", with: ["Transform"] }],
        resourceWrites: ["RallyState"],
        schedule: "postUpdate",
        services: ["scene.current"],
        writes: ["Transform"],
      },
    ],
  );
});

test("should reject unsupported lifecycle hooks", () => {
  assert.throws(
    () =>
      scriptLifecycle({
        id: "rally",
        module: "src/scripts/rally.ts",
        onEnter: "enterRally",
        update: "updateRally",
      }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_SCRIPT_LIFECYCLE_HOOK_UNSUPPORTED",
  );
});

test("should reject empty lifecycle declarations", () => {
  assert.throws(
    () =>
      scriptLifecycle({
        id: "rally",
        module: "src/scripts/rally.ts",
      }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_SCRIPT_LIFECYCLE_EMPTY",
  );
});
