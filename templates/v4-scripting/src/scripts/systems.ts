type ScriptContext = any;

export function rotatePrimitiveCubes(context: ScriptContext): void {
  for (const entity of context.query()) {
    const rotator = entity.get("Rotator");
    const speed = typeof rotator.radiansPerSecond === "number" ? rotator.radiansPerSecond : 1;
    const angle = context.time.elapsed * speed;
    entity.patch("Transform", {
      rotation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
    });
  }
  context.events.emit("HitEvent", { source: "cube.rotator.center", target: "floor.primitive" });
}

export function moveTargetPlatform(context: ScriptContext): void {
  const inputAxis = context.input.axis("MoveX");
  const forwardBias = context.input.action("MoveForward") ? 0.1 : 0;
  for (const entity of context.query()) {
    const transform = entity.get("Transform");
    const velocity = entity.get("Velocity");
    const position = transform.position ?? [0, 0, 0];
    const value = velocity.value ?? [0, 0, 0];
    entity.patch("Transform", {
      position: [
        position[0] + (value[0] + inputAxis * 0.2) * context.time.dt,
        position[1],
        position[2] - forwardBias * context.time.dt,
      ],
    });
  }
}

export function spawnProjectileCommand(context: ScriptContext): void {
  if (context.time.elapsed >= 0 || context.input.action("SpawnProjectile")) {
    context.commands.spawn("projectile.spawned", {
      Lifetime: { remaining: 0.5 },
      Marker: { label: "spawned-projectile" },
      Transform: { position: [0, 0.35, 1.45], rotation: [0, 0, 0, 1], scale: [0.18, 0.18, 0.18] },
      Velocity: { value: [0, 0, -1.5] },
    });
  }
}

export function expireProjectile(context: ScriptContext): void {
  for (const entity of context.query()) {
    const lifetime = entity.get("Lifetime");
    const remaining = Math.max(0, Number(((lifetime.remaining ?? 0) - context.time.dt).toFixed(6)));
    entity.patch("Lifetime", { remaining });
    if (entity.id === "projectile.expired" && remaining <= 0) {
      context.commands.despawn("projectile.expired");
    }
  }
}

export function raycastHitProbe(context: ScriptContext): void {
  const hit = context.physics.raycast({
    direction: [0, -1, 0],
    ignore: ["cube.rotator.center"],
    maxDistance: 3,
    origin: [0, 1, 0],
  });
  if (hit.hit) {
    context.events.emit("HitEvent", { source: "cube.rotator.center", target: hit.entity });
  }
}

export function hitEventHandoff(context: ScriptContext): void {
  const hits = context.events.read("HitEvent");
  if (hits.length === 0) {
    return;
  }
  for (const entity of context.query()) {
    const transform = entity.get("Transform");
    const scale = transform.scale ?? [1, 1, 1];
    entity.patch("Transform", { scale: [scale[0], scale[1] + 0.02, scale[2]] });
  }
}

export function animationServiceProof(context: ScriptContext): void {
  context.animation.play("cube.rotator.center", "pulse", { loop: false, speed: 1 });
}
