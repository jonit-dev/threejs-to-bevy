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

interface IShotState {
  life: number;
  px: number;
  py: number;
  pz: number;
  targetId: string;
  vx: number;
  vy: number;
  vz: number;
}

interface IShipState {
  destroyedAt: number;
  health: number;
  hitInside: boolean[];
}

interface IExplosionState {
  life: number;
  x: number;
  y: number;
  z: number;
}

// One script owns the whole air battle: two IJN Zero squads flying CAP over
// the destroyer group, USN SBD wingmen escorting the player, escort destroyers,
// pooled tracers for both sides, midair/sea collisions, and the radar feed.
// All AI aircraft fly guided kinematic flight: the script owns the velocity
// vector every fixed tick, so planes hold formation, altitude, and coordinated
// banked turns deterministically instead of fighting the aero integrator.
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
      { hasAero: true, id: "enemy.zero", offset: [0, 0, 0], side: "ijn", spawn: [400, 300, -1800], squad: 0 },
      { hasAero: true, id: "enemy.zero.1", offset: [-70, 14, 55], side: "ijn", spawn: [0, 312, -1400], squad: 0 },
      { hasAero: true, id: "enemy.zero.2", offset: [70, 14, 55], side: "ijn", spawn: [-400, 312, -1800], squad: 0 },
      { hasAero: true, id: "enemy.zero.3", offset: [0, 28, 115], side: "ijn", spawn: [0, 325, -2200], squad: 0 },
      { hasAero: true, id: "enemy.zero.4", offset: [-70, 14, 55], side: "ijn", spawn: [500, 315, -2600], squad: 1 },
      { hasAero: true, id: "enemy.zero.5", offset: [70, 14, 55], side: "ijn", spawn: [-500, 315, -2600], squad: 1 },
      { hasAero: true, id: "enemy.zero.6", offset: [0, 28, 115], side: "ijn", spawn: [0, 330, -3000], squad: 1 },
      { hasAero: true, id: "enemy.zero.7", offset: [0, 0, 0], side: "ijn", spawn: [0, 300, -2300], squad: 1 },
      { hasAero: false, id: "friendly.sbd.0", offset: [-140, 12, 60], side: "usn", spawn: [-140, 270, 120], squad: 0 },
      { hasAero: false, id: "friendly.sbd.1", offset: [140, 12, 60], side: "usn", spawn: [140, 270, 120], squad: 0 }
    ];
    const SHIPS = [
      { id: "enemy.samidare.2", position: [-450, 4.95, -1600] },
      { id: "enemy.samidare.3", position: [450, 4.95, -2000] }
    ];
    const IJN_MAX_HEALTH = 60;
    const USN_MAX_HEALTH = 80;
    const SHIP_MAX_HEALTH = 120;
    const ZERO_TRACERS = 8;
    const FRIENDLY_TRACERS = 8;
    const PLAYER_TRACER_POOL = 14;
    const EXPLOSIONS = 4;
    const SEA_FLOOR_ALTITUDE = 85;
    const CEILING_ALTITUDE = 620;
    const COLLISION_RADIUS_SQ = 121;
    const maxHealthFor = (side: string): number => (side === "ijn" ? IJN_MAX_HEALTH : USN_MAX_HEALTH);
    const initialPlaneState = (side: string): IPlaneState => ({
      destroyedAt: -1,
      extendUntil: 0,
      extendX: 0,
      extendZ: 0,
      fireCooldown: 1.2,
      health: maxHealthFor(side),
      hitInside: Array.from({ length: PLAYER_TRACER_POOL }, () => false),
      phase: side === "ijn" ? "CAP" : "ESCORT",
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

    const control = context.state("air-battle-control", {
      explosions: Array.from({ length: EXPLOSIONS }, (): IExplosionState => ({ life: 0, x: 0, y: -9999, z: 0 })),
      friendlyShots: Array.from(
        { length: FRIENDLY_TRACERS },
        (): IShotState => ({ life: 0, px: 0, py: -9999, pz: 0, targetId: "", vx: 0, vy: 0, vz: 0 })
      ),
      hitsOnPlayer: 0,
      nextExplosion: 0,
      nextFriendlyShot: 0,
      nextZeroShot: 0,
      planes: PLANES.map((plane) => initialPlaneState(plane.side)),
      provoked: false,
      radarTick: 0,
      ships: SHIPS.map((): IShipState => ({
        destroyedAt: -1,
        health: SHIP_MAX_HEALTH,
        hitInside: Array.from({ length: PLAYER_TRACER_POOL }, () => false)
      })),
      squadBActive: false,
      zeroShots: Array.from(
        { length: ZERO_TRACERS },
        (): IShotState => ({ life: 0, px: 0, py: -9999, pz: 0, targetId: "", vx: 0, vy: 0, vz: 0 })
      )
    });

    const dt = context.time.fixedDelta;
    const restart = context.input.pressed("retry") || context.events.read("flight:restart").length > 0;
    if (restart) {
      control.hitsOnPlayer = 0;
      control.nextExplosion = 0;
      control.nextFriendlyShot = 0;
      control.nextZeroShot = 0;
      control.provoked = false;
      control.squadBActive = false;
      for (const pool of [
        { entities: "enemy.zero.tracer.", shots: control.zeroShots },
        { entities: "friendly.tracer.", shots: control.friendlyShots }
      ]) {
        for (let index = 0; index < pool.shots.length; index += 1) {
          pool.shots[index]!.life = 0;
          context.entity(`${pool.entities}${index}`)?.patch("Transform", { position: [0, -9999, 0] });
        }
      }
      for (let index = 0; index < control.explosions.length; index += 1) {
        control.explosions[index]!.life = 0;
        context.entity(`fx.explosion.${index}`)?.patch("Transform", { position: [0, -9999, 0], scale: [0.001, 0.001, 0.001] });
      }
      for (let index = 0; index < PLANES.length; index += 1) {
        const plane = PLANES[index]!;
        control.planes[index] = initialPlaneState(plane.side);
        const entity = context.entity(plane.id);
        if (entity === undefined) continue;
        const maxHealth = maxHealthFor(plane.side);
        entity.patch("Health", { current: maxHealth, max: maxHealth });
        entity.patch("Transform", {
          position: [plane.spawn[0]!, plane.spawn[1]!, plane.spawn[2]!],
          rotation: plane.side === "ijn" ? [0, 1, 0, 0] : [0, 0, 0, 1]
        });
        context.physics.setLinearVelocity(plane.id, plane.side === "ijn" ? [0, 0, 78] : [0, 0, -72]);
        context.physics.setAngularVelocity(plane.id, [0, 0, 0]);
      }
      for (let index = 0; index < SHIPS.length; index += 1) {
        const ship = SHIPS[index]!;
        control.ships[index] = {
          destroyedAt: -1,
          health: SHIP_MAX_HEALTH,
          hitInside: Array.from({ length: PLAYER_TRACER_POOL }, () => false)
        };
        const entity = context.entity(ship.id);
        entity?.patch("Health", { current: SHIP_MAX_HEALTH, max: SHIP_MAX_HEALTH });
        entity?.patch("Transform", {
          position: [ship.position[0]!, ship.position[1]!, ship.position[2]!],
          rotation: [0, 0, 0, 1]
        });
        context.entity(`${ship.id}.fire.0`)?.patch("Transform", { position: [ship.position[0]!, -100, ship.position[2]!], scale: [0.001, 0.001, 0.001] });
        for (const smoke of [0, 1]) {
          context.entity(`${ship.id}.smoke.${smoke}`)?.patch("Transform", { position: [ship.position[0]!, -100, ship.position[2]!], scale: [0.001, 0.001, 0.001] });
        }
      }
    }

    const spawnExplosion = (x: number, y: number, z: number): void => {
      const explosion = control.explosions[control.nextExplosion % EXPLOSIONS]!;
      control.nextExplosion += 1;
      explosion.life = 0.65;
      explosion.x = x;
      explosion.y = y;
      explosion.z = z;
    };

    const playerPosition = player.transform().position;
    const playerHealthState = player.get("Health", { current: 100, max: 100 });
    const playerAlive = (playerHealthState.current ?? 100) > 0;
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
    const playerTracerPositions: Array<readonly number[] | undefined> = [];
    for (let index = 0; index < PLAYER_TRACER_POOL; index += 1) {
      playerTracerPositions.push(context.entity(`tracer.${String(index).padStart(2, "0")}`)?.transform().position);
    }

    // Provocation: the battle starts when the destroyer group or any escort
    // takes damage. A hands-off patrol flight is never intercepted, which
    // keeps cruise scenarios deterministic and gives the player the first
    // move. Squad B holds its far CAP until squad A is nearly wiped or the
    // rear ships come under fire.
    const destroyerEntity = context.entity("enemy.samidare");
    const destroyerHealthState = destroyerEntity?.get("Health", { current: 120, max: 120 });
    if (!control.provoked) {
      const shipDamaged = (destroyerHealthState?.current ?? 120) < (destroyerHealthState?.max ?? 120)
        || control.ships.some((ship) => ship.health < SHIP_MAX_HEALTH);
      const flightDamaged = control.planes.some((plane, index) =>
        plane.health < maxHealthFor(PLANES[index]!.side));
      if (shipDamaged || flightDamaged) control.provoked = true;
    }
    if (control.provoked && !control.squadBActive) {
      const squadAAlive = control.planes.filter((plane, index) =>
        PLANES[index]!.side === "ijn" && PLANES[index]!.squad === 0 && plane.health > 0).length;
      const squadBDamaged = control.planes.some((plane, index) =>
        PLANES[index]!.side === "ijn" && PLANES[index]!.squad === 1 && plane.health < IJN_MAX_HEALTH);
      const rearShipsDamaged = control.ships.some((ship) => ship.health < SHIP_MAX_HEALTH);
      if (squadAAlive <= 1 || squadBDamaged || rearShipsDamaged) control.squadBActive = true;
    }

    // Escort destroyers take player tracer hits through the same rising-edge
    // test the lead destroyer uses in flight.ts (ships are axis-aligned).
    for (let shipIndex = 0; shipIndex < SHIPS.length; shipIndex += 1) {
      const ship = SHIPS[shipIndex]!;
      const state = control.ships[shipIndex]!;
      if (state.health <= 0) continue;
      for (let tracerIndex = 0; tracerIndex < PLAYER_TRACER_POOL; tracerIndex += 1) {
        const at = playerTracerPositions[tracerIndex];
        if (at === undefined) continue;
        const inside = Math.abs((at[0] ?? 0) - ship.position[0]!) <= 74
          && (at[1] ?? 0) >= 2 && (at[1] ?? 0) <= 36
          && Math.abs((at[2] ?? 0) - ship.position[2]!) <= 8.5;
        if (inside && !state.hitInside[tracerIndex]) {
          state.health = Math.max(0, state.health - 10);
          context.entity(ship.id)?.patch("Health", { current: state.health, max: SHIP_MAX_HEALTH });
          if (state.health === 0) {
            state.destroyedAt = context.time.elapsed;
            spawnExplosion(ship.position[0]!, 22, ship.position[2]!);
          }
        }
        state.hitInside[tracerIndex] = inside;
      }
    }

    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestPhase = "DESTROYED";
    let nearestHealth = 0;
    let zerosAlive = 0;
    let friendliesAlive = 0;

    for (let index = 0; index < PLANES.length; index += 1) {
      const plane = PLANES[index]!;
      const state = control.planes[index]!;
      const enemy = context.entity(plane.id);
      const visual = context.entity(`${plane.id}.visual`);
      const position = positions[index];
      if (enemy === undefined || visual === undefined || position === undefined) continue;

      const maxHealth = maxHealthFor(plane.side);
      const body = enemy.get("RigidBody", { velocity: [0, 0, plane.side === "ijn" ? 78 : -72] });
      const velocity = body.velocity ?? [0, 0, plane.side === "ijn" ? 78 : -72];

      // Player tracer hits only damage IJN aircraft; friendly fire stays off.
      if (plane.side === "ijn" && state.health > 0) {
        for (let tracerIndex = 0; tracerIndex < state.hitInside.length; tracerIndex += 1) {
          const at = playerTracerPositions[tracerIndex];
          if (at === undefined) continue;
          const dx = (at[0] ?? 0) - position[0];
          const dy = (at[1] ?? 0) - position[1];
          const dz = (at[2] ?? 0) - position[2];
          const inside = (at[1] ?? 0) > 0 && dx * dx + dy * dy + dz * dz <= 56.25;
          if (inside && !state.hitInside[tracerIndex]) {
            state.health = Math.max(0, state.health - 10);
            enemy.patch("Health", { current: state.health, max: maxHealth });
            if (state.health === 0) {
              state.destroyedAt = context.time.elapsed;
              state.phase = "DESTROYED";
              spawnExplosion(position[0], position[1], position[2]);
            }
          }
          state.hitInside[tracerIndex] = inside;
        }
      }

      // Midair collisions: planes against planes, and planes against the
      // player. Both airframes are lost in the fireball.
      if (state.health > 0) {
        for (let otherIndex = index + 1; otherIndex < PLANES.length; otherIndex += 1) {
          const otherState = control.planes[otherIndex]!;
          const other = positions[otherIndex];
          if (other === undefined || otherState.health <= 0) continue;
          const dx = position[0] - other[0];
          const dy = position[1] - other[1];
          const dz = position[2] - other[2];
          if (dx * dx + dy * dy + dz * dz <= COLLISION_RADIUS_SQ) {
            state.health = 0;
            otherState.health = 0;
            state.destroyedAt = context.time.elapsed;
            otherState.destroyedAt = context.time.elapsed;
            state.phase = "DESTROYED";
            otherState.phase = "DESTROYED";
            enemy.patch("Health", { current: 0, max: maxHealth });
            context.entity(PLANES[otherIndex]!.id)?.patch("Health", { current: 0, max: maxHealthFor(PLANES[otherIndex]!.side) });
            spawnExplosion((position[0] + other[0]) / 2, (position[1] + other[1]) / 2, (position[2] + other[2]) / 2);
          }
        }
        if (state.health > 0 && playerAlive) {
          const dx = position[0] - playerPosition[0];
          const dy = position[1] - playerPosition[1];
          const dz = position[2] - playerPosition[2];
          if (dx * dx + dy * dy + dz * dz <= COLLISION_RADIUS_SQ) {
            state.health = 0;
            state.destroyedAt = context.time.elapsed;
            state.phase = "DESTROYED";
            enemy.patch("Health", { current: 0, max: maxHealth });
            player.patch("Health", { current: 0, max: 100 });
            spawnExplosion(playerPosition[0], playerPosition[1], playerPosition[2]);
          }
        }
      }

      const toPlayerX = playerPosition[0] - position[0];
      const toPlayerY = playerPosition[1] - position[1];
      const toPlayerZ = playerPosition[2] - position[2];
      const playerDistance = Math.max(0.001, Math.hypot(toPlayerX, toPlayerY, toPlayerZ));

      if (state.health <= 0) {
        // Terminal dive: keep the heading, trade altitude for speed with an
        // accelerating roll, then park below the surface after the splash.
        if (plane.hasAero) {
          context.physics.aerodynamics.setInputs(plane.id, {
            surfaces: { "aileron.left": 0, "aileron.right": 0, elevator: 0 },
            thrusters: { "nakajima-sakae": 0 }
          });
        }
        if (!state.splashed) {
          const sinkVy = Math.max(-70, (velocity[1] ?? 0) - 30 * dt);
          context.physics.setAngularVelocity(plane.id, [0, 0.5, 0]);
          context.physics.setLinearVelocity(plane.id, [velocity[0], sinkVy, velocity[2]]);
          state.visualBank += dt * 3.4;
          state.visualPitch = Math.max(-0.9, state.visualPitch - dt * 0.8);
          if (position[1] <= 4) {
            state.splashed = true;
            spawnExplosion(position[0], 4, position[2]);
            context.physics.setLinearVelocity(plane.id, [0, 0, 0]);
            context.physics.setAngularVelocity(plane.id, [0, 0, 0]);
            enemy.patch("Transform", { position: [position[0], -60, position[2]] });
          }
        }
      } else {
        if (plane.side === "ijn") zerosAlive += 1;
        else friendliesAlive += 1;

        // Target selection. Zeros hunt the nearest US aircraft (player or
        // escort); SBDs hunt the nearest Zero.
        let targetId = "aircraft";
        let targetPosition: readonly number[] = playerPosition;
        let targetVelocity: readonly number[] = playerVelocity;
        let targetDistance = playerDistance;
        if (plane.side === "ijn") {
          if (!playerAlive) targetDistance = Number.POSITIVE_INFINITY;
          for (let otherIndex = 0; otherIndex < PLANES.length; otherIndex += 1) {
            if (PLANES[otherIndex]!.side !== "usn" || control.planes[otherIndex]!.health <= 0) continue;
            const other = positions[otherIndex];
            if (other === undefined) continue;
            const d = Math.hypot(other[0] - position[0], other[1] - position[1], other[2] - position[2]);
            if (d < targetDistance) {
              targetDistance = d;
              targetId = PLANES[otherIndex]!.id;
              targetPosition = other;
              targetVelocity = context.entity(targetId)?.get("RigidBody", { velocity: [0, 0, -72] }).velocity ?? [0, 0, -72];
            }
          }
          if (!Number.isFinite(targetDistance)) {
            targetId = "aircraft";
            targetPosition = playerPosition;
            targetVelocity = playerVelocity;
            targetDistance = playerDistance;
          }
        } else {
          targetDistance = Number.POSITIVE_INFINITY;
          for (let otherIndex = 0; otherIndex < PLANES.length; otherIndex += 1) {
            if (PLANES[otherIndex]!.side !== "ijn" || control.planes[otherIndex]!.health <= 0) continue;
            const other = positions[otherIndex];
            if (other === undefined) continue;
            const d = Math.hypot(other[0] - position[0], other[1] - position[1], other[2] - position[2]);
            if (d < targetDistance) {
              targetDistance = d;
              targetId = PLANES[otherIndex]!.id;
              targetPosition = other;
              targetVelocity = context.entity(targetId)?.get("RigidBody", { velocity: [0, 0, 78] }).velocity ?? [0, 0, 78];
            }
          }
        }
        const engaged = Number.isFinite(targetDistance);

        // Phase selection. EXTEND breaks off after a close pass so a plane
        // regains separation instead of orbiting its target at knife range.
        const dormantIjn = plane.side === "ijn"
          && (!control.provoked || (plane.squad === 1 && !control.squadBActive));
        if (plane.side === "ijn" ? dormantIjn : (!control.provoked || !engaged)) {
          state.phase = plane.side === "ijn" ? "CAP" : "ESCORT";
        } else if (state.phase === "CAP" || state.phase === "ESCORT") {
          state.phase = "INTERCEPT";
        } else if (state.phase === "EXTEND" || state.phase === "DEFENSIVE") {
          if (context.time.elapsed >= state.extendUntil) state.phase = "INTERCEPT";
        } else if (targetDistance < 150) {
          state.phase = state.health <= 20 ? "DEFENSIVE" : "EXTEND";
          state.extendUntil = context.time.elapsed + (state.phase === "DEFENSIVE" ? 5 : 3.5);
          const lateral = index % 2 === 0 ? 1 : -1;
          // Break perpendicular to the target bearing, alternating sides.
          const toTargetX = targetPosition[0]! - position[0];
          const toTargetZ = targetPosition[2]! - position[2];
          const breakLength = Math.max(0.001, Math.hypot(toTargetZ, toTargetX));
          state.extendX = (-toTargetZ / breakLength) * lateral;
          state.extendZ = (toTargetX / breakLength) * lateral;
        } else if (targetDistance < 480) {
          state.phase = "ATTACK";
        } else {
          state.phase = "INTERCEPT";
        }

        // Target point per phase.
        const leadTime = engaged ? Mathf.clamp(targetDistance / 300, 0.3, 1.4) : 0.5;
        let targetX = targetPosition[0]! + targetVelocity[0]! * leadTime;
        let targetY = targetPosition[1]! + targetVelocity[1]! * leadTime;
        let targetZ = targetPosition[2]! + targetVelocity[2]! * leadTime;
        if (state.phase === "CAP") {
          const capCenter = plane.squad === 0
            ? (destroyerEntity?.transform().position ?? [0, 5, -900])
            : [0, 5, -2000];
          const capAngle = index * (Math.PI / 2) + context.time.elapsed * 0.06;
          targetX = capCenter[0]! + Math.cos(capAngle) * 420;
          targetY = 300 + index * 8;
          targetZ = capCenter[2]! - 600 + Math.sin(capAngle) * 420;
        } else if (state.phase === "ESCORT") {
          targetX = playerPosition[0] + plane.offset[0]!;
          targetY = playerPosition[1] + plane.offset[1]!;
          targetZ = playerPosition[2] + plane.offset[2]! + playerVelocity[2]! * 0.5;
        } else if (state.phase === "INTERCEPT") {
          targetX += plane.offset[0]!;
          targetY += plane.offset[1]!;
          targetZ += plane.offset[2]!;
        } else if (state.phase === "EXTEND" || state.phase === "DEFENSIVE") {
          targetX = position[0] + state.extendX * 500;
          targetY = position[1] + 45;
          targetZ = position[2] + state.extendZ * 500;
        }

        // Simple separation: steer away from any close flight mate.
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
        if (plane.hasAero) {
          context.physics.aerodynamics.setInputs(plane.id, {
            surfaces: { "aileron.left": 0, "aileron.right": 0, elevator: 0 },
            thrusters: { "nakajima-sakae": Mathf.clamp(0.55 + (speedTarget - horizontalSpeed) * 0.05, 0.35, 1) }
          });
        }

        const bankTarget = Mathf.clamp(-yawRate * 1.05, -0.5, 0.5);
        state.visualBank += (bankTarget - state.visualBank) * Mathf.clamp(dt * 3.2, 0, 1);
        const totalSpeed = Math.max(20, Math.hypot(velocity[0], velocity[1], velocity[2]));
        const pitchTarget = Mathf.clamp(Math.asin(Mathf.clamp(newClimb / totalSpeed, -1, 1)), -0.32, 0.32);
        state.visualPitch += (pitchTarget - state.visualPitch) * Mathf.clamp(dt * 3.2, 0, 1);

        // Gunnery: fire only on a settled attack run, staggered per plane so
        // the battle sounds like sequenced bursts instead of one volley.
        state.fireCooldown = Math.max(0, state.fireCooldown - dt);
        if (engaged && state.phase === "ATTACK" && targetDistance < 430 && state.fireCooldown <= 0) {
          const toTargetX = targetPosition[0]! - position[0];
          const toTargetY = targetPosition[1]! - position[1];
          const toTargetZ = targetPosition[2]! - position[2];
          const alignment = (toTargetX * velocity[0] + toTargetY * velocity[1] + toTargetZ * velocity[2])
            / (targetDistance * totalSpeed);
          if (alignment > 0.97) {
            state.fireCooldown = (plane.side === "ijn" ? 0.8 : 0.7) + index * 0.09;
            const pool = plane.side === "ijn" ? control.zeroShots : control.friendlyShots;
            const shotIndex = plane.side === "ijn"
              ? control.nextZeroShot++ % ZERO_TRACERS
              : control.nextFriendlyShot++ % FRIENDLY_TRACERS;
            const shot = pool[shotIndex]!;
            shot.targetId = targetId;
            shot.px = position[0];
            shot.py = position[1] - 0.4;
            shot.pz = position[2];
            shot.vx = (toTargetX / targetDistance) * 300 + velocity[0] * 0.45;
            shot.vy = (toTargetY / targetDistance) * 300 + velocity[1] * 0.45;
            shot.vz = (toTargetZ / targetDistance) * 300 + velocity[2] * 0.45;
            shot.life = 1.6;
          }
        }
      }

      // Damage presentation: wing fires and rising smoke below half health.
      const damage = 1 - state.health / maxHealth;
      const pulse = 0.82 + Math.sin(context.time.elapsed * 9 + index * 1.7) * 0.18;
      const burning = state.health <= maxHealth / 2 && !state.splashed;
      const fireScale = burning ? Math.max(0.001, damage * pulse) : 0.001;
      const smokeCycle = (context.time.elapsed * 0.45 + index * 0.31) % 1;
      const smokeScale = burning
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

      // Compose cosmetic roll and pitch on the visual child. The A6M3 model
      // faces -Z natively (qz(bank) * qx(pitch)); the SBD faces +Z and needs
      // the authored yaw-180 composed in front: qy(180) * qz(bank) * qx(pitch).
      const halfBank = state.visualBank / 2;
      const halfPitch = state.visualPitch / 2;
      const sinBank = Math.sin(halfBank);
      const cosBank = Math.cos(halfBank);
      const sinPitch = Math.sin(halfPitch);
      const cosPitch = Math.cos(halfPitch);
      const qx = cosBank * sinPitch;
      const qy = sinBank * sinPitch;
      const qz = sinBank * cosPitch;
      const qw = cosBank * cosPitch;
      visual.patch("Transform", {
        rotation: plane.side === "ijn" ? [qx, qy, qz, qw] : [qz, qw, -qx, -qy]
      });
      context.animation.play(`${plane.id}.visual`, "flight.cruise", {
        activeState: "flight.cruise",
        loop: true,
        sourceClip: "flight.cruise",
        speed: state.health > 0 ? 28 : 4
      });

      if (plane.side === "ijn" && state.health > 0 && playerDistance < nearestDistance) {
        nearestDistance = playerDistance;
        nearestPhase = state.phase;
        nearestHealth = state.health;
      }
    }

    // Advance both tracer pools; each shot only harms the target it was
    // aimed at, so the battle stays deterministic and side-safe.
    for (const pool of [
      { damage: 4, entities: "enemy.zero.tracer.", shots: control.zeroShots },
      { damage: 10, entities: "friendly.tracer.", shots: control.friendlyShots }
    ]) {
      for (let index = 0; index < pool.shots.length; index += 1) {
        const shot = pool.shots[index]!;
        const entity = context.entity(`${pool.entities}${index}`);
        if (entity === undefined || shot.life <= 0) continue;
        shot.life -= dt;
        shot.px += shot.vx * dt;
        shot.py += shot.vy * dt;
        shot.pz += shot.vz * dt;
        let targetAt: readonly number[] | undefined;
        if (shot.targetId === "aircraft") {
          targetAt = playerAlive ? playerPosition : undefined;
        } else {
          const targetIndex = PLANES.findIndex((candidate) => candidate.id === shot.targetId);
          if (targetIndex >= 0 && control.planes[targetIndex]!.health > 0) targetAt = positions[targetIndex];
        }
        if (targetAt !== undefined) {
          const hitX = shot.px - targetAt[0]!;
          const hitY = shot.py - targetAt[1]!;
          const hitZ = shot.pz - targetAt[2]!;
          if (hitX * hitX + hitY * hitY + hitZ * hitZ <= 42.25) {
            shot.life = 0;
            if (shot.targetId === "aircraft") {
              control.hitsOnPlayer += 1;
              player.patch("Health", {
                current: Math.max(0, (playerHealthState.current ?? 100) - pool.damage),
                max: 100
              });
            } else {
              const targetIndex = PLANES.findIndex((candidate) => candidate.id === shot.targetId);
              if (targetIndex >= 0) {
                const targetState = control.planes[targetIndex]!;
                targetState.health = Math.max(0, targetState.health - pool.damage);
                const targetMax = maxHealthFor(PLANES[targetIndex]!.side);
                context.entity(shot.targetId)?.patch("Health", { current: targetState.health, max: targetMax });
                if (targetState.health === 0) {
                  targetState.destroyedAt = context.time.elapsed;
                  targetState.phase = "DESTROYED";
                  const at = positions[targetIndex];
                  if (at !== undefined) spawnExplosion(at[0], at[1], at[2]);
                }
              }
            }
          }
        }
        if (shot.life <= 0 || shot.py < 1) shot.py = -9999;
        entity.patch("Transform", { position: [shot.px, shot.py, shot.pz] });
      }
    }

    // Explosion pool: a fast fireball pop that collapses back to the park
    // position when spent.
    for (let index = 0; index < control.explosions.length; index += 1) {
      const explosion = control.explosions[index]!;
      const entity = context.entity(`fx.explosion.${index}`);
      if (entity === undefined) continue;
      if (explosion.life > 0) {
        explosion.life = Math.max(0, explosion.life - dt);
        const age = 1 - explosion.life / 0.65;
        const flare = Math.sin(Math.min(1, age * 1.15) * Math.PI);
        const size = Math.max(0.001, flare * (10 + age * 14));
        entity.patch("Transform", {
          position: [explosion.x, explosion.y + age * 6, explosion.z],
          scale: [size, size * 1.15, size]
        });
      } else {
        entity.patch("Transform", { position: [0, -9999, 0], scale: [0.001, 0.001, 0.001] });
      }
    }

    // Escort destroyer damage presentation and sinking.
    for (let shipIndex = 0; shipIndex < SHIPS.length; shipIndex += 1) {
      const ship = SHIPS[shipIndex]!;
      const state = control.ships[shipIndex]!;
      const entity = context.entity(ship.id);
      if (entity === undefined) continue;
      const destroyed = state.destroyedAt >= 0;
      const destroyedTime = destroyed ? context.time.elapsed - state.destroyedAt : 0;
      if (destroyed) {
        const sink = Mathf.clamp(destroyedTime / 10, 0, 1);
        const roll = Mathf.clamp(destroyedTime / 7, 0, 1) * 0.52;
        const halfRoll = roll / 2;
        entity.patch("Transform", {
          position: [ship.position[0]!, 4.95 - sink * 22, ship.position[2]! - sink * 5],
          rotation: [Math.sin(halfRoll), 0, 0, Math.cos(halfRoll)]
        });
      }
      const burning = state.health <= SHIP_MAX_HEALTH / 2;
      const firePulse = 0.82 + Math.sin(context.time.elapsed * 7.5 + shipIndex * 2.1) * 0.18;
      const fireFade = destroyed ? 1 - Mathf.clamp((destroyedTime - 12) / 8, 0, 0.72) : 1;
      const fireScale = burning ? firePulse * fireFade * (destroyed ? 12 : 6) : 0.001;
      context.entity(`${ship.id}.fire.0`)?.patch("Transform", {
        position: [ship.position[0]!, 17, ship.position[2]!],
        scale: [Math.max(0.001, fireScale), Math.max(0.001, fireScale * 1.4), 1]
      });
      for (const smokeIndex of [0, 1]) {
        const cycle = (context.time.elapsed * 0.2 + smokeIndex * 0.4) % 1;
        const smokeScale = burning ? (5 + cycle * 16) * Math.sin(cycle * Math.PI) : 0.001;
        context.entity(`${ship.id}.smoke.${smokeIndex}`)?.patch("Transform", {
          position: [
            ship.position[0]! + (smokeIndex === 0 ? -18 : 16),
            20 + cycle * 40,
            ship.position[2]!
          ],
          scale: [Math.max(0.001, smokeScale * 0.8), Math.max(0.001, smokeScale), 1]
        });
      }
    }

    const shipsAlive = (((destroyerHealthState?.current ?? 120) > 0) ? 1 : 0)
      + control.ships.filter((ship) => ship.health > 0).length;
    context.resources.patch("EnemyState", {
      distance: Number.isFinite(nearestDistance) ? Math.round(nearestDistance) : -1,
      friendliesAlive,
      health: nearestHealth,
      hitsOnPlayer: control.hitsOnPlayer,
      phase: nearestPhase,
      shipsAlive,
      shipsTotal: SHIPS.length + 1,
      targetId: "aircraft",
      zerosAlive,
      zerosTotal: PLANES.filter((plane) => plane.side === "ijn").length
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
          playerPosition, playerYaw, position,
          PLANES[index]!.side === "ijn" ? "zero" : "friendly",
          state.health > 0
        );
      }
      if (destroyerEntity !== undefined) {
        contacts["enemy.samidare"] = radarContact(
          playerPosition, playerYaw, destroyerEntity.transform().position, "ship",
          (destroyerHealthState?.current ?? 0) > 0
        );
      }
      for (let shipIndex = 0; shipIndex < SHIPS.length; shipIndex += 1) {
        contacts[SHIPS[shipIndex]!.id] = radarContact(
          playerPosition, playerYaw, SHIPS[shipIndex]!.position, "ship",
          control.ships[shipIndex]!.health > 0
        );
      }
      context.events.emit("flight:radar", {
        contacts,
        headingDeg: Math.round((((-playerYaw) * 180 / Math.PI) % 360 + 360) % 360),
        rangeMeters: 2400
      });
    }
  }
);
