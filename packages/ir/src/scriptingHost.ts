import type { IrSystemService } from "./systems.js";

export type ScriptHostSupport = "implemented" | "unsupported";

export interface IScriptHostServiceMatrixEntry {
  bevy: ScriptHostSupport;
  context: string;
  domain: "animation" | "assets" | "audio" | "character" | "navigation" | "particles" | "persistence" | "physics" | "picking" | "scene" | "sequence" | "settings" | "ui";
  service: IrSystemService;
  web: ScriptHostSupport;
}

export const SCRIPT_HOST_SERVICE_MATRIX = [
  { bevy: "implemented", context: "ctx.animation.play", domain: "animation", service: "animation.play", web: "implemented" },
  { bevy: "implemented", context: "ctx.animation.query", domain: "animation", service: "animation.query", web: "implemented" },
  { bevy: "implemented", context: "ctx.animation.stop", domain: "animation", service: "animation.stop", web: "implemented" },
  { bevy: "implemented", context: "ctx.assets.load", domain: "assets", service: "assets.load", web: "implemented" },
  { bevy: "implemented", context: "ctx.audio.play", domain: "audio", service: "audio.play", web: "implemented" },
  { bevy: "implemented", context: "ctx.audio.query", domain: "audio", service: "audio.query", web: "implemented" },
  { bevy: "implemented", context: "ctx.audio.stop", domain: "audio", service: "audio.stop", web: "implemented" },
  { bevy: "implemented", context: "ctx.character.move", domain: "character", service: "character.move", web: "implemented" },
  { bevy: "implemented", context: "ctx.navigation.path", domain: "navigation", service: "navigation.path", web: "implemented" },
  { bevy: "implemented", context: "ctx.particles.burst", domain: "particles", service: "particles.burst", web: "implemented" },
  { bevy: "implemented", context: "ctx.particles.reset", domain: "particles", service: "particles.reset", web: "implemented" },
  { bevy: "implemented", context: "ctx.particles.start", domain: "particles", service: "particles.start", web: "implemented" },
  { bevy: "implemented", context: "ctx.particles.stop", domain: "particles", service: "particles.stop", web: "implemented" },
  { bevy: "implemented", context: "ctx.persistence.delete", domain: "persistence", service: "persistence.delete", web: "implemented" },
  { bevy: "implemented", context: "ctx.persistence.listSlots", domain: "persistence", service: "persistence.listSlots", web: "implemented" },
  { bevy: "implemented", context: "ctx.persistence.load", domain: "persistence", service: "persistence.load", web: "implemented" },
  { bevy: "implemented", context: "ctx.persistence.save", domain: "persistence", service: "persistence.save", web: "implemented" },
  { bevy: "implemented", context: "ctx.physics.overlap", domain: "physics", service: "physics.overlap", web: "implemented" },
  { bevy: "implemented", context: "ctx.physics.raycast", domain: "physics", service: "physics.raycast", web: "implemented" },
  { bevy: "implemented", context: "ctx.physics.sensor", domain: "physics", service: "physics.sensor", web: "implemented" },
  { bevy: "implemented", context: "ctx.physics.shapeCast", domain: "physics", service: "physics.shapeCast", web: "implemented" },
  { bevy: "implemented", context: "ctx.picking.mesh", domain: "picking", service: "picking.mesh", web: "implemented" },
  { bevy: "implemented", context: "ctx.picking.pointerRay", domain: "picking", service: "picking.pointerRay", web: "implemented" },
  { bevy: "implemented", context: "ctx.scenes.change", domain: "scene", service: "scene.change", web: "implemented" },
  { bevy: "implemented", context: "ctx.scenes.current", domain: "scene", service: "scene.current", web: "implemented" },
  { bevy: "implemented", context: "ctx.scenes.loadAdditive", domain: "scene", service: "scene.loadAdditive", web: "implemented" },
  { bevy: "implemented", context: "ctx.scenes.pop", domain: "scene", service: "scene.pop", web: "implemented" },
  { bevy: "implemented", context: "ctx.scenes.push", domain: "scene", service: "scene.push", web: "implemented" },
  { bevy: "implemented", context: "ctx.scenes.unload", domain: "scene", service: "scene.unload", web: "implemented" },
  { bevy: "implemented", context: "ctx.sequences.play", domain: "sequence", service: "sequences.play", web: "implemented" },
  { bevy: "implemented", context: "ctx.sequences.query", domain: "sequence", service: "sequences.query", web: "implemented" },
  { bevy: "implemented", context: "ctx.sequences.stop", domain: "sequence", service: "sequences.stop", web: "implemented" },
  { bevy: "implemented", context: "ctx.settings.export", domain: "settings", service: "settings.export", web: "implemented" },
  { bevy: "implemented", context: "ctx.settings.get", domain: "settings", service: "settings.get", web: "implemented" },
  { bevy: "implemented", context: "ctx.settings.import", domain: "settings", service: "settings.import", web: "implemented" },
  { bevy: "implemented", context: "ctx.settings.set", domain: "settings", service: "settings.set", web: "implemented" },
  { bevy: "implemented", context: "ctx.ui.activate", domain: "ui", service: "ui.activate", web: "implemented" },
  { bevy: "implemented", context: "ctx.ui.focus", domain: "ui", service: "ui.focus", web: "implemented" },
  { bevy: "implemented", context: "ctx.ui.read", domain: "ui", service: "ui.read", web: "implemented" },
  { bevy: "implemented", context: "ctx.ui.setDisabled", domain: "ui", service: "ui.setDisabled", web: "implemented" },
  { bevy: "implemented", context: "ctx.ui.setValue", domain: "ui", service: "ui.setValue", web: "implemented" },
] as const satisfies readonly IScriptHostServiceMatrixEntry[];

export const PROMOTED_SCRIPT_SERVICES = SCRIPT_HOST_SERVICE_MATRIX.map((entry) => entry.service);
