import assert from "node:assert/strict";
import test from "node:test";

import { formatMechanicBlockUsage, listMechanicBlocks } from "./registry.js";
import { MECHANIC_BLOCK_DESCRIPTORS, mechanicRecipeCompositions, validateMechanicDescriptors, type IMechanicBlockDescriptor } from "./descriptors.js";
import { planAuthoringRecipe } from "@threenative/authoring";

test("should derive every add help and dispatch entry from descriptors", () => {
  assert.deepEqual(validateMechanicDescriptors(MECHANIC_BLOCK_DESCRIPTORS), []);
  assert.deepEqual(listMechanicBlocks().map((block) => block.id), MECHANIC_BLOCK_DESCRIPTORS.map((descriptor) => descriptor.id));
  assert.equal(formatMechanicBlockUsage(), MECHANIC_BLOCK_DESCRIPTORS.map((descriptor) => descriptor.id).join("|"));
  for (const block of listMechanicBlocks()) {
    assert.equal(block.proofTemplateId, `block-${block.id}`);
    assert.equal(block.mutationCommand.startsWith(`tn add ${block.id} `), true);
    assert.equal(block.sourceOwners.length > 0, true);
    assert.equal(typeof block.write, "function");
    for (const dependency of block.dependencies) assert.equal(MECHANIC_BLOCK_DESCRIPTORS.some((descriptor) => descriptor.id === dependency), true);
  }
});

test("spatial recipe metadata should remain derived from descriptor owners", () => {
  const recipeCompositions = mechanicRecipeCompositions();
  const plan = planAuthoringRecipe({ args: {}, recipeCompositions, recipeId: "spatial-grid-objective" });
  const descriptors = MECHANIC_BLOCK_DESCRIPTORS.filter((descriptor) => descriptor.mechanicFamily === "spatial-grid");
  const composition = recipeCompositions.find((candidate) => candidate.recipeId === "spatial-grid-objective")!;

  assert.deepEqual(plan.gameplayBlocks, descriptors.map((descriptor) => descriptor.id));
  assert.deepEqual(plan.scriptResponsibilities, descriptors.flatMap((descriptor) => descriptor.capabilityIds));
  assert.deepEqual(composition.gameplayBlocks, descriptors.map((descriptor) => descriptor.id));
  for (const descriptor of descriptors) {
    assert.equal(descriptor.recipeIds.includes("spatial-grid-objective"), true);
    assert.equal(plan.proofCommands.some((command) => command.includes(descriptor.proofTemplateId)), true);
    for (const owner of descriptor.sourceOwners) assert.equal(plan.sourceOwners[owner]?.includes(descriptor.id), true);
  }
});

test("should reject incompatible responsibility aliases", () => {
  const base = MECHANIC_BLOCK_DESCRIPTORS[0]!;
  const descriptors: IMechanicBlockDescriptor[] = [
    { ...base, id: "physics-target", keywords: ["push"], mechanicFamily: "physics-contact", proofTemplateId: "block-physics-target" },
    { ...base, id: "projectile", keywords: ["push"], mechanicFamily: "projectile-impact", proofTemplateId: "block-projectile" },
  ];

  assert.equal(validateMechanicDescriptors(descriptors).some((diagnostic) => diagnostic.code === "TN_MECHANIC_DESCRIPTOR_INCOMPATIBLE_ALIAS"), true);
});

test("should reject held discrete input without repeat policy", () => {
  const descriptor: IMechanicBlockDescriptor = {
    ...MECHANIC_BLOCK_DESCRIPTORS[0]!,
    inputPolicies: [{ action: "move", activation: "held", discrete: true }],
  };

  const diagnostic = validateMechanicDescriptors([descriptor]).find((candidate) => candidate.code === "TN_MECHANIC_DESCRIPTOR_INPUT_REPEAT_POLICY");
  assert.match(diagnostic?.message ?? "", /pressed\/released|repeat policy/);
});
