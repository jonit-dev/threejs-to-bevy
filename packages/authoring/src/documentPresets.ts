export type RegistryDocumentPresetId = "flow.ready-playing-win" | "game-archetype.top-down" | "sequence.intro-camera";

const presets: Record<RegistryDocumentPresetId, Record<string, unknown>> = {
  "game-archetype.top-down": {
    schema: "threenative.archetype", version: "0.1.0", kind: "game-archetype", id: "top-down", label: "Top-down",
    summary: "Compact arena or collector games with cardinal movement.",
    controls: ["keyboard.KeyA", "keyboard.KeyD", "keyboard.ArrowLeft", "keyboard.ArrowRight"],
    script: { module: "src/scripts/player.ts", exportName: "movePlayerToGoal", responsibility: "cardinal player movement and arena camera framing" },
    lookProfile: { camera: "orthographic top-down follow", movementPlane: "ground-xz", renderLook: "cinematic" },
    probe: { name: "smoke-movement", path: "playtests/smoke-movement.playtest.json", press: "KeyD", axis: "x" },
  },
  "flow.ready-playing-win": {
    schema: "threenative.flow", version: "0.1.0", id: "match", initial: "ready", scene: "arena",
    states: [
      { id: "ready", actions: [{ kind: "setResource", resource: "GameState.countdown", value: "Ready" }] },
      { id: "playing", actions: [{ kind: "setResource", resource: "GameState.countdown", value: "Go" }, { kind: "playSequence", sequence: "intro" }] },
      { id: "win", actions: [{ kind: "setResource", resource: "GameState.countdown", value: "Goal reached" }] },
    ],
    transitions: [
      { id: "start", from: "ready", to: "playing", trigger: { kind: "event", event: "match.start" } },
      { id: "goal", from: "playing", to: "win", trigger: { kind: "event", event: "goal.reached" } },
    ],
  },
  "sequence.intro-camera": {
    schema: "threenative.sequence", version: "0.1.0", id: "intro", duration: 1.5, skippable: true,
    tracks: [
      { id: "camera", kind: "cameraPose", entity: "camera.main", keyframes: [
        { time: 0, value: { position: [0, 6, 6], lookAt: [0, 0, 0] }, easing: "linear" },
        { time: 1.5, value: { position: [0, 4.2, 4.8], lookAt: [0.4, 0, -0.4] }, easing: "linear" },
      ] },
      { id: "start-beat", kind: "event", keyframes: [{ time: 0.5, value: { event: "intro.beat" } }] },
    ],
  },
};

export function expandRegistryDocumentPreset(data: unknown): unknown {
  if (!isRecord(data) || typeof data.preset !== "string" || !(data.preset in presets)) return data;
  const preset = data.preset as RegistryDocumentPresetId;
  const overrides = isRecord(data.overrides) ? data.overrides : {};
  return { ...structuredClone(presets[preset]), ...structuredClone(overrides), provenance: { registryPreset: preset, source: "@threenative/authoring", version: 1 } };
}

export function listRegistryDocumentPresetIds(): RegistryDocumentPresetId[] {
  return Object.keys(presets).sort() as RegistryDocumentPresetId[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
