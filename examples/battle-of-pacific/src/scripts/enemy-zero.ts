import { defineBehavior, Mathf, type ScriptContext } from "@threenative/script-stdlib";

type EnemyContext = ScriptContext & {
  events: {
    emit(event: string, payload?: Record<string, unknown>): void;
    read(event: string): unknown[];
  };
};

export const updateEnemyZero = defineBehavior(
  {
    id: "enemy-zero-ai",
    eventReads: ["flight:restart"],
    eventWrites: [],
    reads: ["Health", "RigidBody", "Transform"],
    resourceReads: ["EnemyState"],
    resourceWrites: ["EnemyState"],
    schedule: "fixedUpdate",
    services: [
      "animation.play",
      "physics.addTorque",
      "physics.aerodynamics.setInputs",
      "physics.setAngularVelocity",
      "physics.setLinearVelocity"
    ],
    writes: ["Health", "Transform"]
  },
  (rawContext: ScriptContext): void => {
    const context = rawContext as EnemyContext;
    const enemy = context.entity("enemy.zero");
    const visual = context.entity("enemy.zero.visual");
    const player = context.entity("aircraft");
    if (enemy === undefined || visual === undefined || player === undefined) return;

    const control = context.state("enemy-zero-control", {
      fireCooldown: 1.2,
      health: 60,
      hitInside: Array.from({ length: 14 }, () => false),
      hitsOnPlayer: 0,
      nextTracer: 0,
      phase: "INTERCEPT",
      destroyedAt: -1,
      visualBank: 0,
      tracers: Array.from(
        { length: 8 },
        () => ({ life: 0, px: 0, py: -9999, pz: 0, vx: 0, vy: 0, vz: 0 })
      )
    });

    const restart = context.input.pressed("retry") || context.events.read("flight:restart").length > 0;
    if (restart) {
      control.fireCooldown = 1.2;
      control.health = 60;
      control.hitsOnPlayer = 0;
      control.nextTracer = 0;
      control.phase = "INTERCEPT";
      control.destroyedAt = -1;
      control.visualBank = 0;
      for (let index = 0; index < control.hitInside.length; index += 1) control.hitInside[index] = false;
      for (let index = 0; index < control.tracers.length; index += 1) {
        control.tracers[index]!.life = 0;
        context.entity(`enemy.zero.tracer.${index}`)?.patch("Transform", {
          position: [0, -9999, 0]
        });
      }
      enemy.patch("Health", { current: 60, max: 60 });
      enemy.patch("Transform", {
        position: [105, 285, -420],
        rotation: [0, 1, 0, 0]
      });
      context.physics.setLinearVelocity("enemy.zero", [0, 0, 78]);
      context.physics.setAngularVelocity("enemy.zero", [0, 0, 0]);
    }

    const dt = context.time.fixedDelta;
    const enemyPosition = enemy.transform().position;
    const playerPosition = player.transform().position;

    // Player tracers are an authored fixed pool. A rising-edge sphere check
    // gives the AI aircraft portable hit detection without runtime ray handles.
    if (control.health > 0) {
      for (let index = 0; index < control.hitInside.length; index += 1) {
        const tracer = context.entity(`tracer.${String(index).padStart(2, "0")}`);
        if (tracer === undefined) continue;
        const position = tracer.transform().position;
        const dx = position[0] - enemyPosition[0];
        const dy = position[1] - enemyPosition[1];
        const dz = position[2] - enemyPosition[2];
        const inside = position[1] > 0 && dx * dx + dy * dy + dz * dz <= 56.25;
        if (inside && !control.hitInside[index]) {
          control.health = Math.max(0, control.health - 10);
          enemy.patch("Health", { current: control.health, max: 60 });
          if (control.health === 0) {
            control.destroyedAt = context.time.elapsed;
          }
        }
        control.hitInside[index] = inside;
      }
    }

    const dx = playerPosition[0] - enemyPosition[0];
    const dy = playerPosition[1] - enemyPosition[1];
    const dz = playerPosition[2] - enemyPosition[2];
    const distance = Math.max(0.001, Math.hypot(dx, dy, dz));
    const body = enemy.get("RigidBody", {
      angularVelocity: [0, 0, 0],
      velocity: [0, 0, 78]
    });
    const angularVelocity = body.angularVelocity ?? [0, 0, 0];
    const enemyVelocity = body.velocity ?? [0, 0, 78];
    const playerBody = player.get("RigidBody", { velocity: [0, 0, -72] });
    const playerVelocity = playerBody.velocity ?? [0, 0, -72];
    const rotation = enemy.get("Transform", {
      rotation: [0, 1, 0, 0] as [number, number, number, number]
    }).rotation ?? [0, 1, 0, 0];
    const [qx, qy, qz, qw] = rotation;
    const rotate = (vx: number, vy: number, vz: number): [number, number, number] => {
      const tx = 2 * (qy * vz - qz * vy);
      const ty = 2 * (qz * vx - qx * vz);
      const tz = 2 * (qx * vy - qy * vx);
      return [
        vx + qw * tx + qy * tz - qz * ty,
        vy + qw * ty + qz * tx - qx * tz,
        vz + qw * tz + qx * ty - qy * tx
      ];
    };
    const forward = rotate(0, 0, -1);

    if (control.health <= 0) {
      control.phase = "DESTROYED";
      context.physics.aerodynamics.setInputs("enemy.zero", {
        surfaces: {
          "aileron.left": 0,
          "aileron.right": 0,
          elevator: 0
        },
        thrusters: {
          "nakajima-sakae": 0
        }
      });
      context.physics.addTorque("enemy.zero", [
        9000 - angularVelocity[0] * 2500,
        -angularVelocity[1] * 2500,
        17000 - angularVelocity[2] * 2500
      ]);
    } else {
      control.phase = distance < 95
        ? "EVADE"
        : control.health <= 30
          ? "DEFENSIVE"
          : distance < 430
            ? "ATTACK"
            : "INTERCEPT";
      const leadTime = Mathf.clamp(distance / 260, 0.2, 1.5);
      const evasion = control.phase === "EVADE" || control.phase === "DEFENSIVE"
        ? Math.sin(context.time.elapsed * 1.7) * 115
        : 0;
      const targetX = playerPosition[0] + playerVelocity[0] * leadTime + evasion;
      const targetY = Math.max(55, playerPosition[1] + playerVelocity[1] * leadTime + (control.phase === "EVADE" ? 65 : 0));
      const targetZ = playerPosition[2] + playerVelocity[2] * leadTime + (control.phase === "EVADE" ? 130 : 0);
      const aimX = targetX - enemyPosition[0];
      const aimY = targetY - enemyPosition[1];
      const aimZ = targetZ - enemyPosition[2];
      const aimLength = Math.max(0.001, Math.hypot(aimX, aimY, aimZ));
      const desiredX = aimX / aimLength;
      const desiredZ = aimZ / aimLength;
      context.physics.aerodynamics.setInputs("enemy.zero", {
        surfaces: {
          "aileron.left": 0,
          "aileron.right": 0,
          elevator: 0
        },
        thrusters: {
          "nakajima-sakae": control.phase === "EVADE" ? 1 : 0.9
        }
      });
      // Keep the physics frame upright, like the player aircraft, and use a
      // bounded coordinated yaw. The aerodynamic body still owns lift, drag,
      // thrust, and stall response; cosmetic banking belongs to the visual
      // child so the interceptor cannot tumble into an inverted lift state.
      const desiredYaw = Math.atan2(-desiredX, -desiredZ);
      const currentYaw = Math.atan2(
        2 * (qw * qy + qx * qz),
        1 - 2 * (qx * qx + qy * qy)
      );
      let yawError = desiredYaw - currentYaw;
      while (yawError > Math.PI) yawError -= Math.PI * 2;
      while (yawError < -Math.PI) yawError += Math.PI * 2;
      const yawRate = Mathf.clamp(yawError * 1.35, -0.72, 0.72);
      context.physics.setAngularVelocity("enemy.zero", [0, yawRate, 0]);
      const theta = yawRate * dt;
      const cosTurn = Math.cos(theta);
      const sinTurn = Math.sin(theta);
      context.physics.setLinearVelocity("enemy.zero", [
        enemyVelocity[0] * cosTurn + enemyVelocity[2] * sinTurn,
        enemyVelocity[1],
        -enemyVelocity[0] * sinTurn + enemyVelocity[2] * cosTurn
      ]);
      const bankTarget = Mathf.clamp(-yawRate * 0.58, -0.42, 0.42);
      control.visualBank += (bankTarget - control.visualBank) * Mathf.clamp(dt * 3.5, 0, 1);

      const alignment = forward[0] * (dx / distance)
        + forward[1] * (dy / distance)
        + forward[2] * (dz / distance);
      control.fireCooldown = Math.max(0, control.fireCooldown - dt);
      if (control.phase === "ATTACK" && alignment > 0.975 && control.fireCooldown <= 0) {
        control.fireCooldown = 0.32;
        const tracerIndex = control.nextTracer % control.tracers.length;
        const tracer = control.tracers[tracerIndex]!;
        control.nextTracer += 1;
        const muzzle = rotate(control.nextTracer % 2 === 0 ? -0.55 : 0.55, -0.1, -4.7);
        tracer.px = enemyPosition[0] + muzzle[0];
        tracer.py = enemyPosition[1] + muzzle[1];
        tracer.pz = enemyPosition[2] + muzzle[2];
        const shotX = playerPosition[0] - tracer.px;
        const shotY = playerPosition[1] - tracer.py;
        const shotZ = playerPosition[2] - tracer.pz;
        const shotLength = Math.max(0.001, Math.hypot(shotX, shotY, shotZ));
        tracer.vx = shotX / shotLength * 300 + enemyVelocity[0] * 0.45;
        tracer.vy = shotY / shotLength * 300 + enemyVelocity[1] * 0.45;
        tracer.vz = shotZ / shotLength * 300 + enemyVelocity[2] * 0.45;
        tracer.life = 1.6;
      }
    }

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
          current: Math.max(0, (playerHealth.current ?? 100) - 8),
          max: 100
        });
      }
      if (tracer.life <= 0 || tracer.py < 1) tracer.py = -9999;
      entity.patch("Transform", { position: [tracer.px, tracer.py, tracer.pz] });
    }

    const damage = 1 - control.health / 60;
    const pulse = 0.82 + Math.sin(context.time.elapsed * 9) * 0.18;
    const fireScale = control.health <= 30 ? Math.max(0.001, damage * pulse) : 0.001;
    const smokeCycle = (context.time.elapsed * 0.45) % 1;
    const smokeScale = control.health <= 30
      ? Math.max(0.001, damage * (0.7 + smokeCycle * 1.8) * Math.sin(smokeCycle * Math.PI))
      : 0.001;
    for (const side of ["left", "right"]) {
      context.entity(`enemy.zero.fire.${side}`)?.patch("Transform", {
        scale: [fireScale * 1.8, fireScale * 2.8, 1]
      });
      context.entity(`enemy.zero.smoke.${side}`)?.patch("Transform", {
        position: [side === "left" ? -2.8 : 2.8, 0.35 + smokeCycle * 3.5, 0.8 + smokeCycle],
        scale: [smokeScale, smokeScale * 1.4, 1]
      });
    }
    const halfBank = control.visualBank / 2;
    visual.patch("Transform", {
      rotation: [0, 0, Math.sin(halfBank), Math.cos(halfBank)]
    });

    context.animation.play("enemy.zero.visual", "flight.cruise", {
      activeState: "flight.cruise",
      loop: true,
      sourceClip: "flight.cruise",
      speed: control.health > 0 ? 28 : 4
    });
    context.resources.patch("EnemyState", {
      distance: Math.round(distance),
      health: control.health,
      hitsOnPlayer: control.hitsOnPlayer,
      phase: control.phase,
      targetId: "aircraft"
    });
  }
);
