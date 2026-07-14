import type { ScriptContext } from "../index.js";

declare const context: ScriptContext;

context.animation.play("hero", "idle");
context.animation.query("hero");
context.animation.stop("hero");
context.assets.load("hero-model");
context.audio.play("jump");
context.audio.query("jump:1");
context.audio.stop("jump:1");
context.cameras.shake({ amplitude: 0.25, duration: 0.1 });
context.character.move("hero", { direction: [1, 0], speed: 4 });
context.effects.play("hit", { entity: "hero" });
context.navigation.path({ goal: [4, 0, 0], start: [0, 0, 0] });
context.particles.burst("impact", "sparks", { count: 8 });
context.particles.clear("impact", "sparks");
context.particles.emit("impact", "sparks", { count: 1 });
context.particles.play("impact", "sparks");
context.particles.reset("impact", "sparks", { seed: 2 });
context.particles.start("impact", "sparks");
context.particles.stop("impact", "sparks");
context.persistence.delete("autosave");
context.persistence.listSlots();
context.persistence.load("autosave");
context.persistence.save("autosave");
context.physics.addForce("hero", [1, 0, 0]);
context.physics.addTorque("hero", [0, 1, 0]);
context.physics.applyAngularImpulse("hero", [0, 1, 0]);
context.physics.applyImpulse("hero", [1, 0, 0]);
context.physics.overlap({ position: [0, 0, 0], shape: { kind: "sphere", radius: 2 } });
context.physics.raycast({ direction: [0, -1, 0], maxDistance: 10, origin: [0, 2, 0] });
context.physics.sensor({ phases: ["enter"], sensor: "goal" });
context.physics.setAngularVelocity("hero", [0, 1, 0]);
context.physics.setLinearVelocity("hero", [1, 0, 0]);
context.physics.shapeCast({ direction: [1, 0, 0], maxDistance: 2, origin: [0, 0, 0], shape: { halfExtents: [1, 1, 1], kind: "box" } });
context.picking.mesh({ direction: [0, 0, -1], maxDistance: 100, origin: [0, 0, 0] });
context.picking.pointerRay({ pointer: [0, 0] });
context.scenes.change("arena");
context.scenes.current();
context.scenes.loadAdditive("hud");
context.scenes.pop();
context.scenes.push("pause");
context.scenes.unload("hud");
context.sequences.play("intro");
context.sequences.query("intro");
context.sequences.stop("intro");
context.settings.export();
context.settings.get("difficulty");
context.settings.import({ difficulty: "hard" });
context.settings.set("difficulty", "hard");
context.ui.actions();
context.ui.activate("start-button");
context.ui.focus("name-input");
context.ui.read("score-label");
context.ui.setDisabled("start-button", true);
context.ui.setValue("volume", 0.5);

context.channels.send("damage", { amount: 1 });
context.components.type("Transform");
context.observers.propagate("damage", "hero");
context.plugins.has("core");
context.random.range(0, 1);
context.schedule.afterTicks({ delayTicks: 2, id: "respawn" });
context.states.get("Playing");
context.tasks.has("ai");
context.timers.progress(0, 1);
context.query({ with: ["Transform"] });
context.commands.emitEvent("ready");
context.events.emit("ready");

// @ts-expect-error physics vectors must contain exactly three numbers
context.physics.addForce("hero", [1, 2]);
// @ts-expect-error setting values are restricted to portable scalar values
context.settings.set("difficulty", { mode: "hard" });
// @ts-expect-error navigation requests require both start and goal vectors
context.navigation.path({ goal: [1, 0, 0] });
// @ts-expect-error raycasts can miss, so callers must narrow the result discriminant
const assumedRaycastHit: { hit: true } = context.physics.raycast({ direction: [0, -1, 0], maxDistance: 1, origin: [0, 1, 0] });
// @ts-expect-error adapter and renderer handles are not public context surfaces
context.renderer;
