import type { IAuthoringRecipeComposition } from "@threenative/authoring";

export type MechanicBlockId = "follow-camera" | "grid-step" | "occupancy-objective" | "physics-target" | "projectile" | "push-interaction" | "score" | "spawner" | "timer" | "trigger-sequence";
export type SpatialMechanicBlockId = Extract<MechanicBlockId, "grid-step" | "occupancy-objective" | "push-interaction">;
export type MechanicSourceOwner = "input" | "prefabs" | "scene" | "scripts" | "systems" | "ui";
export type MechanicBlockWriter = { kind: "builtin"; id: Exclude<MechanicBlockId, "grid-step" | "occupancy-objective" | "push-interaction"> } | { kind: "spatial" };

export interface IMechanicInputPolicy {
  activation: "held" | "pressed" | "released";
  action: string;
  discrete: boolean;
  repeatPolicy?: "cooldown" | "rate";
}

export interface IMechanicBlockDescriptor {
  capabilityIds: readonly string[];
  dependencies: readonly MechanicBlockId[];
  flags: readonly string[];
  id: MechanicBlockId;
  inputPolicies: readonly IMechanicInputPolicy[];
  keywords: readonly string[];
  mechanicFamily: string;
  mutationCommand: string;
  proofTemplateId: string;
  recipeIds: readonly string[];
  removal: { owner: "mechanic-document" } | { rationale: string };
  responsibilities: readonly string[];
  sourceOwners: readonly MechanicSourceOwner[];
  summary: string;
  writer: MechanicBlockWriter;
}

export interface IMechanicDescriptorDiagnostic {
  code: "TN_MECHANIC_DESCRIPTOR_DEPENDENCY_MISSING" | "TN_MECHANIC_DESCRIPTOR_DUPLICATE_ID" | "TN_MECHANIC_DESCRIPTOR_INCOMPATIBLE_ALIAS" | "TN_MECHANIC_DESCRIPTOR_INPUT_REPEAT_POLICY" | "TN_MECHANIC_DESCRIPTOR_REMOVAL_OWNER" | "TN_MECHANIC_DESCRIPTOR_WRITER_MISMATCH";
  message: string;
}

export const MECHANIC_BLOCK_DESCRIPTORS: readonly IMechanicBlockDescriptor[] = [
  descriptor("spawner", "Spawn stable prefab instances in a grid, ring, or lane pattern.", "spawn-layout", ["spawn", "spawner"], ["spawn-pattern"], ["--pattern", "--prefab", "--count", "--id", "--position", "--scale"], ["scene"]),
  descriptor("timer", "Add a deterministic up/down timer resource and proof hook.", "timer", ["countdown", "timer"], ["timed-progression"], ["--resource", "--direction", "--limit", "--field", "--event", "--id", "--autostart"], ["scene", "systems"]),
  descriptor("trigger-sequence", "Add ordered or unordered checkpoint/trigger sequence metadata.", "trigger-sequence", ["checkpoint", "sequence", "trigger"], ["ordered-trigger-progression"], ["--mode", "--count", "--prefix"], ["scene"]),
  {
    ...descriptor("score", "Add score, win, and retry state tied to named events.", "score", ["score", "win"], ["score-win-retry"], ["--resource", "--win-at"], ["scene", "scripts"]),
    inputPolicies: [{ action: "retry", activation: "pressed", discrete: true }],
  },
  {
    ...descriptor("projectile", "Add an executable projectile lifecycle with portable spawn, impact, cooldown, and cleanup.", "projectile-impact", ["launch", "projectile", "shoot"], ["projectile-launch", "projectile-impact", "projectile-cleanup"], ["--launcher", "--projectile"], ["input", "prefabs", "scene", "scripts", "systems"]),
    inputPolicies: [{ action: "launch", activation: "pressed", discrete: true, repeatPolicy: "cooldown" }],
  },
  {
    ...descriptor("physics-target", "Add a visible set of dynamic collider targets for knockdown mechanics.", "physics-contact", ["dynamic-target", "knockdown", "physics-target"], ["physics-knockdown-target"], ["--count", "--prefix"], ["input", "scene", "scripts", "systems", "ui"]),
    mutationCommand: "tn add physics-target --count 5 --project . --json",
    inputPolicies: [
      { action: "launch", activation: "pressed", discrete: true },
      { action: "retry", activation: "pressed", discrete: true },
    ],
  },
  descriptor("follow-camera", "Retarget or annotate an existing camera follow relationship.", "camera", ["camera-follow", "follow-camera"], ["camera-follow"], ["--camera", "--target"], ["scene"]),
  {
    ...descriptor("grid-step", "Add discrete grid movement with bounds, blocked cells, and retry state.", "spatial-grid", ["grid-move", "grid-step"], ["discrete-grid-movement", "blocked-cell-rejection"], ["--actor", "--step", "--bounds", "--blocked"], ["input", "scene", "scripts", "systems"]),
    capabilityIds: ["move.grid"],
    inputPolicies: [
      { action: "grid-left", activation: "pressed", discrete: true },
      { action: "grid-right", activation: "pressed", discrete: true },
      { action: "grid-up", activation: "pressed", discrete: true },
      { action: "grid-down", activation: "pressed", discrete: true },
      { action: "retry", activation: "pressed", discrete: true },
    ],
    recipeIds: ["spatial-grid-objective"],
    removal: { rationale: "Spatial source is composed atomically; remove or replace the complete spatial composition rather than one shared owner." },
    writer: { kind: "spatial" },
  },
  {
    ...descriptor("push-interaction", "Add push-only adjacent objects with occupied-target rejection.", "spatial-grid", ["crate-push", "push-interaction"], ["push-only-adjacency", "occupied-target-rejection"], ["--crate-prefix", "--crate-count"], ["scene", "scripts", "systems"]),
    capabilityIds: ["interaction.push"],
    dependencies: ["grid-step"],
    recipeIds: ["spatial-grid-objective"],
    removal: { rationale: "Spatial source is composed atomically; remove or replace the complete spatial composition rather than one shared owner." },
    writer: { kind: "spatial" },
  },
  {
    ...descriptor("occupancy-objective", "Add target occupancy progress, win state, HUD, and retry integration.", "spatial-grid", ["occupancy-goal", "pressure-plate"], ["occupancy-progress-win", "spatial-retry"], ["--target-prefix", "--target-count", "--subject-tag"], ["scene", "scripts", "systems", "ui"]),
    capabilityIds: ["objective.occupancy", "state.retry"],
    dependencies: ["grid-step"],
    recipeIds: ["spatial-grid-objective"],
    removal: { rationale: "Spatial source is composed atomically; remove or replace the complete spatial composition rather than one shared owner." },
    writer: { kind: "spatial" },
  },
];

export function mechanicBlockDescriptor(id: string | undefined): IMechanicBlockDescriptor | undefined {
  return MECHANIC_BLOCK_DESCRIPTORS.find((descriptor) => descriptor.id === id);
}

export function mechanicMutationCommand(id: MechanicBlockId, flagValues: Readonly<Record<string, string | number>> = {}): string {
  const descriptor = mechanicBlockDescriptor(id)!;
  const flags = Object.entries(flagValues).flatMap(([flag, value]) => [`--${flag}`, String(value)]).join(" ");
  return flags === "" ? descriptor.mutationCommand : descriptor.mutationCommand.replace(" --project", ` ${flags} --project`);
}

export function mechanicRecipeCompositions(): readonly IAuthoringRecipeComposition[] {
  const recipeIds = [...new Set(MECHANIC_BLOCK_DESCRIPTORS.flatMap((descriptor) => descriptor.recipeIds))].sort();
  return recipeIds.map((recipeId) => {
    const blocks = MECHANIC_BLOCK_DESCRIPTORS.filter((descriptor) => descriptor.recipeIds.includes(recipeId));
    const sourceOwners: Record<string, string[]> = {};
    for (const block of blocks) {
      for (const owner of block.sourceOwners) (sourceOwners[owner] ??= []).push(block.id);
    }
    return {
      gameplayBlocks: blocks.map((block) => block.id),
      proofCommands: [
        "tn authoring validate --project . --json",
        "tn build --project . --json",
        ...blocks.map((block) => `tn playtest --project . --scenario playtests/${block.proofTemplateId}.playtest.json --stable-artifacts --json`),
        "tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json",
        "tn iterate --project . --json",
        `tn recipe remove ${recipeId} --project . --json`,
      ],
      proofHints: blocks.map((block) => block.summary),
      recipeId,
      scriptResponsibilities: [...new Set(blocks.flatMap((block) => block.capabilityIds))],
      sourceOwners,
    };
  });
}

export function mechanicRecipeBlockIds(recipeId: string): SpatialMechanicBlockId[] {
  return MECHANIC_BLOCK_DESCRIPTORS
    .filter((descriptor): descriptor is IMechanicBlockDescriptor & { id: SpatialMechanicBlockId; writer: { kind: "spatial" } } => descriptor.recipeIds.includes(recipeId) && descriptor.writer.kind === "spatial")
    .map((descriptor) => descriptor.id);
}

export function validateMechanicDescriptors(descriptors: readonly IMechanicBlockDescriptor[]): IMechanicDescriptorDiagnostic[] {
  const diagnostics: IMechanicDescriptorDiagnostic[] = [];
  const descriptorIds = new Set(descriptors.map((descriptor) => descriptor.id));
  const ids = new Set<string>();
  const aliases = new Map<string, IMechanicBlockDescriptor>();
  for (const descriptor of descriptors) {
    if (ids.has(descriptor.id)) diagnostics.push({ code: "TN_MECHANIC_DESCRIPTOR_DUPLICATE_ID", message: `Mechanic descriptor id '${descriptor.id}' is duplicated.` });
    ids.add(descriptor.id);
    for (const dependency of descriptor.dependencies) {
      if (dependency === descriptor.id || !descriptorIds.has(dependency)) diagnostics.push({ code: "TN_MECHANIC_DESCRIPTOR_DEPENDENCY_MISSING", message: `Mechanic '${descriptor.id}' has invalid dependency '${dependency}'.` });
    }
    if (!("owner" in descriptor.removal) && descriptor.removal.rationale.trim() === "") diagnostics.push({ code: "TN_MECHANIC_DESCRIPTOR_REMOVAL_OWNER", message: `Mechanic '${descriptor.id}' requires a removal owner or non-removable rationale.` });
    if (descriptor.writer.kind === "builtin" && descriptor.writer.id !== descriptor.id) diagnostics.push({ code: "TN_MECHANIC_DESCRIPTOR_WRITER_MISMATCH", message: `Mechanic '${descriptor.id}' is linked to writer '${descriptor.writer.id}'.` });
    for (const policy of descriptor.inputPolicies) {
      if (policy.discrete && policy.activation === "held" && policy.repeatPolicy === undefined) diagnostics.push({ code: "TN_MECHANIC_DESCRIPTOR_INPUT_REPEAT_POLICY", message: `Generated discrete action '${policy.action}' in mechanic '${descriptor.id}' uses held input without an explicit repeat policy; use pressed/released or declare cooldown/rate repetition.` });
    }
    for (const alias of [...descriptor.keywords, ...descriptor.responsibilities]) {
      const normalized = alias.trim().toLowerCase();
      const existing = aliases.get(normalized);
      if (existing !== undefined && existing.mechanicFamily !== descriptor.mechanicFamily) diagnostics.push({ code: "TN_MECHANIC_DESCRIPTOR_INCOMPATIBLE_ALIAS", message: `Alias '${normalized}' cannot select both '${existing.id}' (${existing.mechanicFamily}) and '${descriptor.id}' (${descriptor.mechanicFamily}).` });
      else aliases.set(normalized, descriptor);
    }
  }
  return diagnostics;
}

function descriptor(id: MechanicBlockId, summary: string, mechanicFamily: string, keywords: readonly string[], responsibilities: readonly string[], flags: readonly string[], sourceOwners: readonly MechanicSourceOwner[]): IMechanicBlockDescriptor {
  return {
    capabilityIds: [id],
    dependencies: [],
    flags,
    id,
    inputPolicies: [],
    keywords,
    mechanicFamily,
    mutationCommand: `tn add ${id} --project . --json`,
    proofTemplateId: `block-${id}`,
    recipeIds: [],
    removal: { owner: "mechanic-document" },
    responsibilities,
    sourceOwners,
    summary,
    writer: { kind: "builtin", id: id as Exclude<MechanicBlockId, "grid-step" | "occupancy-objective" | "push-interaction"> },
  };
}
