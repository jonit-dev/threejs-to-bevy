import { defineBehavior, Mathf, type ScriptContext } from "@threenative/script-stdlib";

type EnemyContext = ScriptContext & {
  events: {
    emit(event: string, payload?: Record<string, unknown>): void;
    read(event: string): unknown[];
  };
};

interface IPlaneState {
  destroyedAt: number;
  extendUntil: number;
  extendX: number;
  extendZ: number;
  fireCooldown: number;
  health: number;
  hitInside: boolean[];
  phase: string;
  splashed: boolean;
  visualBank: number;
  visualPitch: number;
}

interface ITracerState {
  life: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
}

// The A6M3 flight (a four-plane shotai) flies guided kinematic flight: the
// script owns the velocity vector every fixed tick, so the planes hold
// formation, altitude, and coordinated banked turns deterministically instead
// of fighting the aerodynamic integrator. The aero thruster input is still
// driven for engine/prop presentation parity with the player aircraft.
// The bundler emits only the exported function body, so every constant and
// helper lives inside it.
export const updateEnemyZero = defineBehavior(
  {
    id: "enemy-zero-ai",
    eventReads: ["flight:restart"],
    eventWrites: ["flight:radar"],
    reads: ["Health", "RigidBody", "Transform"],
    resourceReads: ["EnemyState"],
    resourceWrites: ["EnemyState"],
    schedule: "fixedUpdate",
    services: [
      "animation.play",
      "physics.aerodynamics.setInputs",
      "physics.setAngularVelocity",
      "physics.setLinearVelocity"
    ],
    writes: ["Health", "Transform"]
  },
  (rawContext: ScriptContext): void => {
    const context = rawContext as EnemyContext;
    const PLANES = [
      { id: "enemy.zero", offset: [0, 0, 0], spawn: [400, 300, -1800] },
      { id: "enemy.zero.1", offset: [-70, 14, 55], spawn: [0, 312, -1400] },
      { id: "enemy.zero.2", offset: [70, 14, 55], spawn: [-400, 312, -1800] },
      { id: "enemy.zero.3", offset: [0, 28, 115], spawn: [0, 325, -2200] }
    ];
    const PLANE_MAX_HEALTH = 60;
    const TRACER_POOL = 8;
    const PLAYER_TRACER_POOL = 14;
    const SEA_FLOOR_ALTITUDE = 85;
    const CEILING_ALTITUDE = 620;
    const initialPlaneState = (): IPlaneState => ({
      destroyedAt: -1,
      extendUntil: 0,
      extendX: 0,
      extendZ: 0,
      fireCooldown: 1.2,
      health: PLANE_MAX_HEALTH,
      hitInside: Array.from({ length: PLAYER_TRACER_POOL }, () => false),
      phase: "INTERCEPT",
      splashed: false,
      visualBank: 0,
      visualPitch: 0
    });
    const radarContact = (
      playerAt: readonly number[],
      playerYawValue: number,
      at: readonly number[],
      kind: string,
      alive: boolean
    ): Record<string, unknown> => {
      const dx = (at[0] ?? 0) - (playerAt[0] ?? 0);
      const dz = (at[2] ?? 0) - (playerAt[2] ?? 0);
      const contactDistance = Math.hypot(dx, dz);
      // World bearing of the contact, made relative to the aircraft heading.
      // Forward is -Z, so a contact dead ahead has bearing 0.
      const worldBearing = Math.atan2(-dx, -dz);
      let relative = worldBearing - playerYawValue;
      while (relative > Math.PI) relative -= Math.PI * 2;
      while (relative < -Math.PI) relative += Math.PI * 2;
      return {
        alive,
        bearingDeg: Math.round(-relative * 180 / Math.PI),
        distance: Math.round(contactDistance),
        kind
      };
    };

    const player = context.entity("aircraft");
    if (player === undefined) return;

    const control = context.state("enemy-flight-control", {
      hitsOnPlayer: 0,
      nextTracer: 0,
      planes: PLANES.map(() => initialPlaneState()),
      provoked: false,
      radarTick: 0,
      tracers: Array.from(
        { length: TRACER_POOL },
        (): ITracerState => ({ life: 0, px: 0, py: -9999, pz: 0, vx: 0, vy: 0, vz: 0 })
      )
    });

    const dt = context.time.fixedDelta;
    const restart = context.input.pressed("retry") || context.events.read("flight:restart").length > 0;
    if (restart) {
      control.hitsOnPlayer = 0;
      control.nextTracer = 0;
      control.provoked = false;
      for (let index = 0; index < control.tracers.length; index += 1) {
        control.tracers[index]!.life = 0;
        context.entity(`enemy.zero.tracer.${index}`)?.patch("Transform", { position: [0, -9999, 0] });
      }
      for (let index = 0; index < PLANES.length; index += 1) {
        const plane = PLANES[index]!;
        control.planes[index] = initialPlaneState();
        const entity = context.entity(plane.id);
        if (entity === undefined) continue;
        entity.patch("Health", { current: PLANE_MAX_HEALTH, max: PLANE_MAX_HEALTH });
        entity.patch("Transform", {
          position: [plane.spawn[0]!, plane.spawn[1]!, plane.spawn[2]!],
          rotation: [0, 1, 0, 0]
        });
        context.physics.setLinearVelocity(plane.id, [0, 0, 78]);
        context.physics.setAngularVelocity(plane.id, [0, 0, 0]);
      }
    }

    const playerPosition = player.transform().position;
    const playerBody = player.get("RigidBody", { velocity: [0, 0, -72] });
    const playerVelocity = playerBody.velocity ?? [0, 0, -72];
    const playerRotation = player.get("Transform", {
      rotation: [0, 0, 0, 1] as [number, number, number, number]
    }).rotation ?? [0, 0, 0, 1];
    const playerYaw = Math.atan2(
      2 * (playerRotation[3] * playerRotation[1] + playerRotation[0] * playerRotation[2]),
      1 - 2 * (playerRotation[0] * playerRotation[0] + playerRotation[1] * playerRotation[1])
    );

    const positions = PLANES.map((plane) => context.entity(plane.id)?.transform().position);

    // The shotai holds a CAP orbit over the destroyer until combat starts:
    // the flight scrambles once the ship or any escort takes damage. A
    // hands-off patrol flight is never intercepted, which keeps cruise
    // scenarios deterministic and gives the player the first move.
    const destroyerEntity = context.entity("enemy.samidare");
    const destroyerHealthState = destroyerEntity?.get("Health", { current: 120, max: 120 });
    if (!control.provoked) {
      const shipDamaged = (destroyerHealthState?.current ?? 120) < (destroyerHealthState?.max ?? 120);
      const flightDamaged = control.planes.some((plane) => plane.health < PLANE_MAX_HEALTH);
      if (shipDamaged || flightDamaged) control.provoked = true;
    }

    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestPhase = "DESTROYED";
    let nearestHealth = 0;
    let aliveCount = 0;

    for (let index = 0; index < PLANES.length; index += 1) {
      const plane = PLANES[index]!;
      const state = control.planes[index]!;
      const enemy = context.entity(plane.id);
      const visual = context.entity(`${plane.id}.visual`);
      const position = positions[index];
      if (enemy === undefined || visual === undefined || position === undefined) continue;

      const body = enemy.get("RigidBody", { velocity: [0, 0, 78] });
      const velocity = body.velocity ?? [0, 0, 78];
      const toPlayerX = playerPosition[0] - position[0];
      const toPlayerY = playerPosition[1] - position[1];
      const toPlayerZ = playerPosition[2] - position[2];
      const distance = Math.max(0.001, Math.hypot(toPlayerX, toPlayerY, toPlayerZ));

      // Player tracer hits: rising-edge sphere test against the authored
      // player tracer pool, the portable pattern shared with the destroyer.
      if (state.health > 0) {
        for (let tracerIndex = 0; tracerIndex < state.hitInside.length; tracerIndex += 1) {
          const tracer = context.entity(`tracer.${String(tracerIndex).padStart(2, "0")}`);
          if (tracer === undefined) continue;
          const tracerPosition = tracer.transform().position;
          const dx = tracerPosition[0] - position[0];
          const dy = tracerPosition[1] - position[1];
          const dz = tracerPosition[2] - position[2];
          const inside = tracerPosition[1] > 0 && dx * dx + dy * dy + dz * dz <= 56.25;
          if (inside && !state.hitInside[tracerIndex]) {
            state.health = Math.max(0, state.health - 10);
            enemy.patch("Health", { current: state.health, max: PLANE_MAX_HEALTH });
            if (state.health === 0) {
              state.destroyedAt = context.time.elapsed;
              state.phase = "DESTROYED";
            }
          }
          state.hitInside[tracerIndex] = inside;
        }
      }

      if (state.health <= 0) {
        // Terminal dive: keep the heading, trade altitude for speed with an
        // accelerating roll, then park below the surface after the splash.
        context.physics.aerodynamics.setInputs(plane.id, {
          surfaces: { "aileron.left": 0, "aileron.right": 0, elevator: 0 },
          thrusters: { "nakajima-sakae": 0 }
        });
        if (!state.splashed) {
          const sinkVy = Math.max(-70, (velocity[1] ?? 0) - 30 * dt);
          context.physics.setAngularVelocity(plane.id, [0, 0.5, 0]);
          context.physics.setLinearVelocity(plane.id, [velocity[0], sinkVy, velocity[2]]);
          state.visualBank += dt * 3.4;
          state.visualPitch = Math.max(-0.9, state.visualPitch - dt * 0.8);
          if (position[1] <= 4) {
            state.splashed = true;
            context.physics.setLinearVelocity(plane.id, [0, 0, 0]);
            context.physics.setAngularVelocity(plane.id, [0, 0, 0]);
            enemy.patch("Transform", { position: [position[0], -60, position[2]] });
          }
        }
      } else {
        aliveCount += 1;

        // Phase selection. EXTEND breaks off after a close pass so the plane
        // regains separation instead of orbiting the player at knife range.
        if (!control.provoked) {
          state.phase = "CAP";
        } else if (state.phase === "CAP") {
          state.phase = "INTERCEPT";
        } else if (state.phase === "EXTEND" || state.phase === "DEFENSIVE") {
          if (context.time.elapsed >= state.extendUntil) state.phase = "INTERCEPT";
        } else if (distance < 150) {
          state.phase = state.health <= 20 ? "DEFENSIVE" : "EXTEND";
          state.extendUntil = context.time.elapsed + (state.phase === "DEFENSIVE" ? 5 : 3.5);
          const lateral = index % 2 === 0 ? 1 : -1;
          // Break perpendicular to the player bearing, alternating sides.
          const breakLength = Math.max(0.001, Math.hypot(toPlayerZ, toPlayerX));
          state.extendX = (-toPlayerZ / breakLength) * lateral;
          state.extendZ = (toPlayerX / breakLength) * lateral;
        } else if (distance < 480) {
          state.phase = "ATTACK";
        } else {
          state.phase = "INTERCEPT";
        }

        // Target point per phase.
        const leadTime = Mathf.clamp(distance / 300, 0.3, 1.4);
        let targetX = playerPosition[0] + playerVelocity[0] * leadTime;
        let targetY = playerPosition[1] + playerVelocity[1] * leadTime;
        let targetZ = playerPosition[2] + playerVelocity[2] * leadTime;
        if (state.phase === "CAP") {
          const capCenter = destroyerEntity?.transform().position ?? [0, 5, -900];
          const capAngle = index * (Math.PI / 2) + context.time.elapsed * 0.06;
          targetX = capCenter[0] + Math.cos(capAngle) * 420;
          targetY = 300 + index * 12;
          targetZ = capCenter[2] - 600 + Math.sin(capAngle) * 420;
        } else if (state.phase === "INTERCEPT") {
          targetX += plane.offset[0]!;
          targetY += plane.offset[1]!;
          targetZ += plane.offset[2]!;
        } else if (state.phase === "EXTEND" || state.phase === "DEFENSIVE") {
          targetX = position[0] + state.extendX * 500;
          targetY = position[1] + 45;
          targetZ = position[2] + state.extendZ * 500;
        }

        // Simple separation: steer away from any closer flight mate.
        for (let otherIndex = 0; otherIndex < PLANES.length; otherIndex += 1) {
          if (otherIndex === index) continue;
          if (control.planes[otherIndex]!.health <= 0) continue;
          const other = positions[otherIndex];
          if (other === undefined) continue;
          const sx = position[0] - other[0];
          const sy = position[1] - other[1];
          const sz = position[2] - other[2];
          const separation = Math.hypot(sx, sy, sz);
          if (separation > 0.001 && separation < 45) {
            targetX += (sx / separation) * 140;
            targetY += (sy / separation) * 30;
            targetZ += (sz / separation) * 140;
          }
        }
        targetY = Mathf.clamp(targetY, SEA_FLOOR_ALTITUDE, CEILING_ALTITUDE);

        // Guided steering: bounded yaw rate turns the horizontal velocity,
        // bounded climb rate tracks target altitude, speed approaches the
        // phase target with an acceleration limit. The physics body stays
        // upright; banking and pitching are cosmetic on the visual child.
        const aimX = targetX - position[0];
        const aimZ = targetZ - position[2];
        const desiredYaw = Math.atan2(-aimX, -aimZ);
        const horizontalSpeed = Math.max(0.001, Math.hypot(velocity[0], velocity[2]));
        const headingYaw = Math.atan2(-velocity[0], -velocity[2]);
        let yawError = desiredYaw - headingYaw;
        while (yawError > Math.PI) yawError -= Math.PI * 2;
        while (yawError < -Math.PI) yawError += Math.PI * 2;
        const yawRate = Mathf.clamp(yawError * 1.15, -0.55, 0.55);
        context.physics.setAngularVelocity(plane.id, [0, yawRate, 0]);

        const speedTarget = state.phase === "EXTEND" ? 92 : state.phase === "ATTACK" ? 82 : 88;
        const newSpeed = horizontalSpeed
          + Mathf.clamp(speedTarget - horizontalSpeed, -16 * dt, 12 * dt);
        const theta = yawRate * dt;
        const cosTurn = Math.cos(theta);
        const sinTurn = Math.sin(theta);
        const headingX = (velocity[0] * cosTurn + velocity[2] * sinTurn) / horizontalSpeed;
        const headingZ = (-velocity[0] * sinTurn + velocity[2] * cosTurn) / horizontalSpeed;
        const climbTarget = Mathf.clamp((targetY - position[1]) * 0.4, -22, 16);
        const newClimb = (velocity[1] ?? 0)
          + Mathf.clamp(climbTarget - (velocity[1] ?? 0), -30 * dt, 30 * dt);
        context.physics.setLinearVelocity(plane.id, [
          headingX * newSpeed,
          newClimb,
          headingZ * newSpeed
        ]);
        context.physics.aerodynamics.setInputs(plane.id, {
          surfaces: { "aileron.left": 0, "aileron.right": 0, elevator: 0 },
          thrusters: { "nakajima-sakae": Mathf.clamp(0.55 + (speedTarget - horizontalSpeed) * 0.05, 0.35, 1) }
        });

        const bankTarget = Mathf.clamp(-yawRate * 1.05, -0.5, 0.5);
        state.visualBank += (bankTarget - state.visualBank) * Mathf.clamp(dt * 3.2, 0, 1);
        const totalSpeed = Math.max(20, Math.hypot(velocity[0], velocity[1], velocity[2]));
        const pitchTarget = Mathf.clamp(Math.asin(Mathf.clamp(newClimb / totalSpeed, -1, 1)), -0.32, 0.32);
        state.visualPitch += (pitchTarget - state.visualPitch) * Mathf.clamp(dt * 3.2, 0, 1);

        // Gunnery: fire only on a settled attack run, staggered per plane so
        // the shotai sounds like sequenced bursts instead of one volley.
        state.fireCooldown = Math.max(0, state.fireCooldown - dt);
        const headingDotPlayer = (toPlayerX * velocity[0] + toPlayerY * velocity[1] + toPlayerZ * velocity[2])
          / (distance * totalSpeed);
        if (state.phase === "ATTACK" && distance < 430 && headingDotPlayer > 0.975 && state.fireCooldown <= 0) {
          state.fireCooldown = 0.55 + index * 0.09;
          const tracer = control.tracers[control.nextTracer % TRACER_POOL]!;
          control.nextTracer += 1;
          tracer.px = position[0];
          tracer.py = position[1] - 0.4;
          tracer.pz = position[2];
          tracer.vx = (toPlayerX / distance) * 300 + velocity[0] * 0.45;
          tracer.vy = (toPlayerY / distance) * 300 + velocity[1] * 0.45;
          tracer.vz = (toPlayerZ / distance) * 300 + velocity[2] * 0.45;
          tracer.life = 1.6;
        }
      }

      // Damage presentation: wing fires and rising smoke below half health.
      const damage = 1 - state.health / PLANE_MAX_HEALTH;
      const pulse = 0.82 + Math.sin(context.time.elapsed * 9 + index * 1.7) * 0.18;
      const fireScale = state.health <= 30 && !state.splashed ? Math.max(0.001, damage * pulse) : 0.001;
      const smokeCycle = (context.time.elapsed * 0.45 + index * 0.31) % 1;
      const smokeScale = state.health <= 30 && !state.splashed
        ? Math.max(0.001, damage * (0.7 + smokeCycle * 1.8) * Math.sin(smokeCycle * Math.PI))
        : 0.001;
      for (const side of ["left", "right"]) {
        context.entity(`${plane.id}.fire.${side}`)?.patch("Transform", {
          scale: [fireScale * 1.8, fireScale * 2.8, 1]
        });
        context.entity(`${plane.id}.smoke.${side}`)?.patch("Transform", {
          position: [side === "left" ? -2.8 : 2.8, 0.35 + smokeCycle * 3.5, 0.8 + smokeCycle],
          scale: [smokeScale, smokeScale * 1.4, 1]
        });
      }

      // Compose cosmetic roll and pitch on the visual child:
      // qz(bank) * qx(pitch).
      const halfBank = state.visualBank / 2;
      const halfPitch = state.visualPitch / 2;
      const sinBank = Math.sin(halfBank);
      const cosBank = Math.cos(halfBank);
      const sinPitch = Math.sin(halfPitch);
      const cosPitch = Math.cos(halfPitch);
      visual.patch("Transform", {
        rotation: [cosBank * sinPitch, sinBank * sinPitch, sinBank * cosPitch, cosBank * cosPitch]
      });
      context.animation.play(`${plane.id}.visual`, "flight.cruise", {
        activeState: "flight.cruise",
        loop: true,
        sourceClip: "flight.cruise",
        speed: state.health > 0 ? 28 : 4
      });

      if (state.health > 0 && distance < nearestDistance) {
        nearestDistance = distance;
        nearestPhase = state.phase;
        nearestHealth = state.health;
      }
    }

    // Shared enemy tracer pool advance + player hit test.
    for (let index = 0; index < control.tracers.length; index += 1) {
      const tracer = control.tracers[index]!;
      const entity = context.entity(`enemy.zero.tracer.${index}`);
      if (entity === undefined || tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.px += tracer.vx * dt;
      tracer.py += tracer.vy * dt;
      tracer.pz += tracer.vz * dt;
      const hitX = tracer.px - playerPosition[0];
      const hitY = tracer.py - playerPosition[1];
      const hitZ = tracer.pz - playerPosition[2];
      if (hitX * hitX + hitY * hitY + hitZ * hitZ <= 42.25) {
        tracer.life = 0;
        control.hitsOnPlayer += 1;
        const playerHealth = player.get("Health", { current: 100, max: 100 });
        player.patch("Health", {
          current: Math.max(0, (playerHealth.current ?? 100) - 6),
          max: 100
        });
      }
      if (tracer.life <= 0 || tracer.py < 1) tracer.py = -9999;
      entity.patch("Transform", { position: [tracer.px, tracer.py, tracer.pz] });
    }

    context.resources.patch("EnemyState", {
      distance: Number.isFinite(nearestDistance) ? Math.round(nearestDistance) : -1,
      health: nearestHealth,
      hitsOnPlayer: control.hitsOnPlayer,
      phase: nearestPhase,
      targetId: "aircraft",
      zerosAlive: aliveCount,
      zerosTotal: PLANES.length
    });

    // Radar contacts for the overlay minimap, published at 10 Hz. Bearings are
    // relative to the player's heading so the scope can render heading-up.
    control.radarTick += 1;
    if (control.radarTick % 6 === 0) {
      const contacts: Record<string, Record<string, unknown>> = {};
      for (let index = 0; index < PLANES.length; index += 1) {
        const position = positions[index];
        if (position === undefined) continue;
        const state = control.planes[index]!;
        contacts[PLANES[index]!.id] = radarContact(
          playerPosition, playerYaw, position, "zero", state.health > 0
        );
      }
      if (destroyerEntity !== undefined) {
        contacts["enemy.samidare"] = radarContact(
          playerPosition, playerYaw, destroyerEntity.transform().position, "ship",
          (destroyerHealthState?.current ?? 0) > 0
        );
      }
      context.events.emit("flight:radar", {
        contacts,
        headingDeg: Math.round((((-playerYaw) * 180 / Math.PI) % 360 + 360) % 360),
        rangeMeters: 1600
      });
    }
  }
);
