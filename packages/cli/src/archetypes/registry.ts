export type GameArchetypeId = "first-person" | "racing" | "side-scroller" | "third-person" | "top-down";

export interface IGameArchetypeDescriptor {
  controls: string[];
  id: GameArchetypeId;
  label: string;
  lookProfile: {
    camera: string;
    movementPlane: "ground-xz" | "lane-xz" | "side-x-y";
    renderLook: "balanced" | "cinematic" | "parity" | "stylized";
  };
  probe: {
    axis: "x" | "z";
    name: string;
    path: string;
    press: string;
  };
  script: {
    exportName: string;
    module: string;
    responsibility: string;
  };
  summary: string;
}

const descriptors: readonly IGameArchetypeDescriptor[] = [
  {
    controls: ["keyboard.KeyA", "keyboard.KeyD", "keyboard.ArrowLeft", "keyboard.ArrowRight"],
    id: "top-down",
    label: "Top-down",
    lookProfile: { camera: "orthographic top-down follow", movementPlane: "ground-xz", renderLook: "balanced" },
    probe: { axis: "x", name: "archetype-top-down", path: "playtests/archetype-top-down.playtest.json", press: "KeyD" },
    script: { exportName: "updateTopDownArchetype", module: "src/scripts/archetype.ts", responsibility: "cardinal player movement and arena camera framing" },
    summary: "Compact arena or collector games with cardinal movement.",
  },
  {
    controls: ["keyboard.KeyW", "keyboard.KeyA", "keyboard.KeyS", "keyboard.KeyD", "mouse.look"],
    id: "third-person",
    label: "Third-person",
    lookProfile: { camera: "perspective chase camera", movementPlane: "ground-xz", renderLook: "cinematic" },
    probe: { axis: "x", name: "archetype-third-person", path: "playtests/archetype-third-person.playtest.json", press: "KeyD" },
    script: { exportName: "updateThirdPersonArchetype", module: "src/scripts/archetype.ts", responsibility: "character movement with chase-camera ownership notes" },
    summary: "Character games with a follow camera and world-relative movement.",
  },
  {
    controls: ["keyboard.KeyW", "keyboard.KeyA", "keyboard.KeyS", "keyboard.KeyD", "mouse.look"],
    id: "first-person",
    label: "First-person",
    lookProfile: { camera: "first-person eye-level camera", movementPlane: "ground-xz", renderLook: "parity" },
    probe: { axis: "x", name: "archetype-first-person", path: "playtests/archetype-first-person.playtest.json", press: "KeyD" },
    script: { exportName: "updateFirstPersonArchetype", module: "src/scripts/archetype.ts", responsibility: "body movement plus look-controller handoff points" },
    summary: "Immersive games where camera, body, and input orientation are coupled.",
  },
  {
    controls: ["keyboard.KeyA", "keyboard.KeyD", "keyboard.Space", "keyboard.ArrowLeft", "keyboard.ArrowRight"],
    id: "side-scroller",
    label: "Side-scroller",
    lookProfile: { camera: "orthographic side camera", movementPlane: "side-x-y", renderLook: "stylized" },
    probe: { axis: "x", name: "archetype-side-scroller", path: "playtests/archetype-side-scroller.playtest.json", press: "KeyD" },
    script: { exportName: "updateSideScrollerArchetype", module: "src/scripts/archetype.ts", responsibility: "horizontal movement with jump/gravity profile notes" },
    summary: "Platforming or runner games constrained to a side-view plane.",
  },
  {
    controls: ["keyboard.KeyW", "keyboard.KeyA", "keyboard.KeyS", "keyboard.KeyD", "keyboard.ArrowUp", "keyboard.ArrowDown"],
    id: "racing",
    label: "Racing",
    lookProfile: { camera: "low chase camera", movementPlane: "lane-xz", renderLook: "cinematic" },
    probe: { axis: "x", name: "archetype-racing", path: "playtests/archetype-racing.playtest.json", press: "KeyD" },
    script: { exportName: "updateRacingArchetype", module: "src/scripts/archetype.ts", responsibility: "throttle/steer profile notes before checkpoint mechanics are added" },
    summary: "Vehicle games with throttle, steering, and chase-camera framing.",
  },
];

export function getGameArchetype(id: string | undefined): IGameArchetypeDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.id === id);
}

export function listGameArchetypes(): readonly IGameArchetypeDescriptor[] {
  return descriptors;
}

export function selectGameArchetype(goal: string): IGameArchetypeDescriptor {
  const normalized = goal.toLowerCase();
  if (/\b(race|racer|racing|car|kart|drive|driving|lap|checkpoint|vehicle)\b/.test(normalized)) {
    return descriptorsById.racing;
  }
  if (/\b(first[- ]person|fps|cockpit|mouse[- ]look|look around)\b/.test(normalized)) {
    return descriptorsById["first-person"];
  }
  if (/\b(side[- ]scroller|sidescroller|platformer|platform|jump|side[- ]view)\b/.test(normalized)) {
    return descriptorsById["side-scroller"];
  }
  if (/\b(third[- ]person|chase[- ]camera|follow[- ]camera|over[- ]shoulder)\b/.test(normalized)) {
    return descriptorsById["third-person"];
  }
  if (/\b(top[- ]down|collector|collectible|coin|arena|pickup)\b/.test(normalized)) {
    return descriptorsById["top-down"];
  }
  return descriptorsById["third-person"];
}

export function formatGameArchetypeUsage(): string {
  return listGameArchetypes().map((descriptor) => descriptor.id).join("|");
}

const descriptorsById = Object.fromEntries(descriptors.map((descriptor) => [descriptor.id, descriptor])) as Record<GameArchetypeId, IGameArchetypeDescriptor>;
