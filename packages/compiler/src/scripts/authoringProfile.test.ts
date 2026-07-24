import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SCRIPT_HOST_SERVICE_MATRIX } from "@threenative/ir";

import { createCompactAuthoringProfile } from "./authoringProfile.js";
import { diagnosePortableSystem } from "./diagnostics.js";

test("should derive every compact rule from a diagnostic or public facade", async () => {
  const profile = createCompactAuthoringProfile();
  const emittedCodes = new Set(diagnosePortableSystem({
    resourceReads: [],
    resourceWrites: [],
    source: `document.body; context.resources.get("GameState"); context.resources.patch("GameState", { won: true });`,
    systemName: "profile-probe",
  }).map((item) => item.code));
  const compilerSources = `${await readFile("src/scripts/diagnostics.ts", "utf8")}\n${await readFile("src/scripts/sourceRefs.ts", "utf8")}\n${await readFile("src/scripts/moduleGraph.ts", "utf8")}`;

  for (const rule of profile.rules) {
    assert.equal(rule.source, "compiler-diagnostic");
    assert.equal(rule.diagnosticCodes.length > 0, true);
    assert.equal(rule.diagnosticCodes.every((code) => emittedCodes.has(code) || compilerSources.includes(code)), true, rule.id);
  }
  assert.deepEqual(profile.conventionalApis.discreteInput, ["pressed", "released"]);
  assert.equal(profile.conventionalApis.resources.includes("get"), true);
  assert.equal(profile.conventionalApis.transforms.includes("setPosition"), true);
  assert.deepEqual(profile.capabilities.services, SCRIPT_HOST_SERVICE_MATRIX.map(({ service }) => service));
  assert.deepEqual(profile.capabilities.runtimeEntities, ["spawn", "instantiate", "despawn"]);
  assert.deepEqual(profile.capabilities.components, {
    commands: ["addComponent", "removeComponent", "setComponent"],
    entity: ["get", "has", "patch", "set"],
    reflection: ["hooks", "type", "types"],
  });
  assert.deepEqual(profile.sourceEditing, {
    directDurableSource: "supported-when-no-bounded-operation",
    preferred: "bounded-cli",
    requiredFollowup: "authoring-validation",
  });
  assert.equal(profile.explicitAbsences.some((entry) => entry.id === "renderer-native-and-model-sub-node-handles"), true);
  for (const absence of profile.explicitAbsences) {
    assert.equal(absence.diagnosticCodes.every((code) => compilerSources.includes(code)), true, absence.id);
  }
});

test("should keep the compact authoring profile below its briefing budget", () => {
  const bytes = Buffer.byteLength(JSON.stringify(createCompactAuthoringProfile()), "utf8");

  assert.equal(bytes < 4 * 1024, true, `profile was ${bytes} bytes`);
});
