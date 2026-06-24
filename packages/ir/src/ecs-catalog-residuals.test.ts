import assert from "node:assert/strict";
import test from "node:test";

import { BEVY_CATALOG_RESIDUAL_ROWS, diagnoseBevyCatalogResidualDeclarations } from "./bevyCatalogResiduals.js";

test("should reject callback components without declared permissions", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    ecs: {
      callbackComponents: [{ callback: "onDamage", component: "Health", path: "systems.ir.json/catalog/callbacks/Health/onDamage" }],
    },
  });

  assert.equal(diagnostics[0]?.code, "TN_CATALOG_ECS_CALLBACK_PERMISSION_MISSING");
  assert.equal(diagnostics[0]?.path, "systems.ir.json/catalog/callbacks/Health/onDamage");
  assert.match(diagnostics[0]?.suggestion ?? "", /scheduled system/);
});

test("should track every ECS catalog residual with promotion criteria", () => {
  const ecsRows = BEVY_CATALOG_RESIDUAL_ROWS.filter((row) => row.area === "ecs");

  assert.deepEqual(ecsRows.map((row) => row.id), [
    "ecs.callback-components",
    "ecs.delayed-commands",
    "ecs.query-combinations",
    "ecs.entity-disabling",
  ]);
  assert.equal(ecsRows.every((row) => row.baseline === "bevy-0.14.2"), true);
  assert.equal(ecsRows.every((row) => row.promotionCriteria.length > 0), true);
  const queryCombinations = ecsRows.find((row) => row.id === "ecs.query-combinations");
  assert.equal(queryCombinations?.status, "promoted");
  assert.deepEqual(queryCombinations?.reportEvidence, ["web.query-combination-order", "bevy.query-combination-order"]);
  const entityDisabling = ecsRows.find((row) => row.id === "ecs.entity-disabling");
  assert.equal(entityDisabling?.status, "promoted");
  assert.deepEqual(entityDisabling?.reportEvidence, ["web.disabled-entity-query-participation", "bevy.disabled-entity-query-participation"]);
});

test("should reject arbitrary delayed commands and raw entity disabling", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    ecs: {
      delayedCommands: [{ kind: "closure", path: "systems.ir.json/catalog/delayed/0" }],
      entityDisabling: [{ mode: "raw-bevy-disabled", path: "world.ir.json/entities/0/Disabled" }],
    },
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_CATALOG_ECS_DELAYED_COMMAND_UNSUPPORTED",
    "TN_CATALOG_ECS_ENTITY_DISABLE_UNSUPPORTED",
  ]);
  assert.match(diagnostics[0]?.suggestion ?? "", /fixed-trace tasks/);
  assert.match(diagnostics[1]?.suggestion ?? "", /participation component/);
});
