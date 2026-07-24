import { defineBehavior, Mathf, type ScriptContext } from "@threenative/script-stdlib";

type FlightContext = ScriptContext & {
  events: {
    emit(event: string, payload?: Record<string, unknown>): void;
    read(event: string): unknown[];
  };
};

export const updatePacificFlight = defineBehavior(
  {
    id: "pacific-flight",
    eventReads: ["flight:restart", "flight:toggle-flaps"],
    eventWrites: ["flight:telemetry"],
    reads: ["RigidBody", "Transform"],
    resourceReads: ["FlightState"],
    resourceWrites: ["FlightState"],
    schedule: "fixedUpdate",
    services: [
      "animation.play",
      "audio.play",
      "audio.stop",
      "physics.addTorque",
      "physics.aerodynamics.setInputs",
      "physics.setAngularVelocity",
      "physics.setLinearVelocity"
    ],
    writes: ["Transform"]
  },
  (rawContext: ScriptContext): void => {
    const context = rawContext as FlightContext;
    const aircraft = context.entity("aircraft");
    const visual = context.entity("aircraft.visual");
    if (aircraft === undefined || visual === undefined) return;

    const control = context.state("pacific-flight-control", {
      activeClip: "",
      enginePlaybackId: "",
      engineStartAt: -1,
      engineBand: -1,
      engineBandChangedAt: 0,
      elapsed: 0,
      flapTransitionUntil: 0,
      flapsDown: false,
      retracting: false,
      discBlend: 0,
      fireCooldown: 0,
      gunRecoil: 0,
      lastGunSfx: -1,
      muzzleFlash: 0,
      musicStarted: false,
      nextSmoke: 0,
      nextTracer: 0,
      prevFailed: false,
      prevStall: false,
      retryCount: 0,
      throttle: 0.82,
      smokePuffs: Array.from(
        { length: 8 },
        () => ({ driftX: 0, driftY: 0, life: 0, twist: 0 })
      ),
      tracers: [] as Array<{ life: number; px: number; py: number; pz: number; vx: number; vy: number; vz: number }>,
      visualBank: 0
    });

    const restartFromOverlay = context.events.read("flight:restart").length > 0;
    const retryRequested = context.input.pressed("retry") || restartFromOverlay;

    // The music is session ambience, while the engine follows the aircraft
    // lifecycle. The radial engine is the aircraft's presence and must read
    // clearly over the music bed without masking flight cues.
    if (!control.musicStarted) {
      context.audio.play("music.battle", { loop: true, volume: 0.35 });
      control.musicStarted = true;
    }
    // The engine spools up rather than snapping on: a start one-shot leads and
    // the sustained loop fades in ~1s later so the drone "catches" on spawn or
    // retry instead of appearing at full power.
    if (control.enginePlaybackId === "" && control.engineStartAt < 0 && (!control.prevFailed || retryRequested)) {
      context.audio.play("engine.start", { volume: 0.75 });
      control.engineStartAt = context.time.elapsed;
    }
    if (retryRequested) {
      aircraft.patch("Transform", {
        position: [0, 260, 0],
        rotation: [0, 0, 0, 1]
      });
      context.physics.setLinearVelocity("aircraft", [0, 0, -72]);
      context.physics.setAngularVelocity("aircraft", [0, 0, 0]);
      control.activeClip = "";
      control.elapsed = 0;
      control.flapTransitionUntil = 0;
      control.flapsDown = false;
      control.retracting = false;
      control.retryCount += 1;
      for (const puff of control.smokePuffs) puff.life = 0;
      control.throttle = 0.82;
      control.visualBank = 0;
    }

    const dt = context.time.fixedDelta;
    if (context.input.getButton("throttle-up")) {
      control.throttle = Mathf.clamp(control.throttle + dt * 0.22, 0, 1);
    }
    if (context.input.getButton("throttle-down")) {
      control.throttle = Mathf.clamp(control.throttle - dt * 0.22, 0, 1);
    }

    // Bring the sustained loop in once the spool-up has taken hold, voiced at
    // the current throttle band.
    if (control.engineStartAt >= 0 && context.time.elapsed >= control.engineStartAt + 1) {
      const band = Mathf.clamp(Math.floor(control.throttle / 0.2), 0, 4);
      const t = (band + 0.5) * 0.2;
      const engine = context.audio.play("engine.loop", {
        loop: true,
        volume: 0.45 + 0.35 * t,
        pitch: 0.85 + 0.35 * t
      });
      if (engine.accepted) {
        control.enginePlaybackId = engine.playbackId;
        control.engineBand = band;
        control.engineBandChangedAt = context.time.elapsed;
      }
      control.engineStartAt = -1;
    }
    // Throttle-reactive engine: re-voice the loop per throttle band with
    // hysteresis (cross a band edge by >0.04, no more than once per 0.7s) so the
    // drone rises and falls with power without chattering at a boundary. The
    // same recorded loop is reused; only its rate and level change.
    if (control.enginePlaybackId !== "" && control.engineBand >= 0) {
      const rawBand = Mathf.clamp(Math.floor(control.throttle / 0.2), 0, 4);
      let switchTo = -1;
      if (rawBand > control.engineBand && control.throttle >= (control.engineBand + 1) * 0.2 + 0.04) {
        switchTo = rawBand;
      } else if (rawBand < control.engineBand && control.throttle <= control.engineBand * 0.2 - 0.04) {
        switchTo = rawBand;
      }
      if (switchTo >= 0 && context.time.elapsed - control.engineBandChangedAt >= 0.7) {
        const t = (switchTo + 0.5) * 0.2;
        context.audio.stop(control.enginePlaybackId);
        const engine = context.audio.play("engine.loop", {
          loop: true,
          volume: 0.45 + 0.35 * t,
          pitch: 0.85 + 0.35 * t
        });
        control.enginePlaybackId = engine.accepted ? engine.playbackId : "";
        control.engineBand = switchTo;
        control.engineBandChangedAt = context.time.elapsed;
      }
    }

    const toggleFlaps = context.input.pressed("flaps")
      || context.events.read("flight:toggle-flaps").length > 0;
    if (toggleFlaps && context.time.elapsed >= control.flapTransitionUntil) {
      control.retracting = control.flapsDown;
      control.flapsDown = !control.flapsDown;
      control.flapTransitionUntil = context.time.elapsed + 3;
      control.activeClip = "";
    }

    const pitch = context.input.getAxis("pitch");
    const roll = context.input.getAxis("roll");
    const yaw = context.input.getAxis("yaw");
    context.physics.aerodynamics.setInputs("aircraft", {
      surfaces: {
        "aileron.left": roll,
        "aileron.right": -roll,
        elevator: -pitch,
        flaps: control.flapsDown ? 1 : 0
      },
      thrusters: {
        "wright-r1820": control.throttle
      }
    });
    const body = aircraft.get("RigidBody", {
      angularVelocity: [0, 0, 0],
      velocity: [0, 0, -72]
    });
    const angularVelocity = body.angularVelocity ?? [0, 0, 0];
    // A/D fly a coordinated banked turn: yaw torque points the nose while the
    // velocity vector is rotated with the turn (no sideslip energy loss), and
    // the visual model banks cosmetically; the physics body never rolls.
    const turn = Mathf.clamp(roll + yaw * 0.7, -1, 1);
    context.physics.addTorque("aircraft", [
      -angularVelocity[0] * 30000,
      -turn * 14000 - angularVelocity[1] * 25000,
      -angularVelocity[2] * 55000
    ]);
    const velocityNow = body.velocity ?? [0, 0, -72];
    const yawRate = angularVelocity[1];
    if (Math.abs(yawRate) > 0.0005) {
      const theta = yawRate * dt;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      context.physics.setLinearVelocity("aircraft", [
        velocityNow[0] * cosT + velocityNow[2] * sinT,
        velocityNow[1],
        -velocityNow[0] * sinT + velocityNow[2] * cosT
      ]);
    }
    // Wing guns: Space fires paired tracers from the wing roots that converge
    // on the aim point 500 m ahead. Tracer entities are a fixed authored pool
    // recycled by index; inactive rounds park far below the ocean.
    const TRACER_POOL = 14;
    const rotation = aircraft.get("Transform", { rotation: [0, 0, 0, 1] as [number, number, number, number] }).rotation ?? [0, 0, 0, 1];
    const [qx, qy, qz, qw] = rotation;
    const rotate = (v: readonly [number, number, number]): [number, number, number] => {
      const [vx2, vy2, vz2] = v;
      const tx = 2 * (qy * vz2 - qz * vy2);
      const ty = 2 * (qz * vx2 - qx * vz2);
      const tz = 2 * (qx * vy2 - qy * vx2);
      return [
        vx2 + qw * tx + qy * tz - qz * ty,
        vy2 + qw * ty + qz * tx - qx * tz,
        vz2 + qw * tz + qx * ty - qy * tx
      ];
    };
    while (control.tracers.length < TRACER_POOL) control.tracers.push({ life: 0, px: 0, py: -9999, pz: 0, vx: 0, vy: 0, vz: 0 });
      control.fireCooldown = Math.max(0, control.fireCooldown - dt);
    control.gunRecoil = Math.max(0, control.gunRecoil - dt * 9);
    const aircraftPosition = aircraft.transform().position;
    if (context.input.getButton("fire") && control.fireCooldown <= 0) {
      // The SBD-3's paired forward Browning guns read as a fast mechanical
      // burst. Visual rounds run faster than the longer recorded audio cue.
      control.fireCooldown = 0.09;
      if (context.time.elapsed - control.lastGunSfx >= 0.34) {
        context.audio.play("guns.burst");
        control.lastGunSfx = context.time.elapsed;
      }
      const forwardWorld = rotate([0, 0, -1]);
      const aim = [
        aircraftPosition[0] + forwardWorld[0] * 500,
        aircraftPosition[1] + forwardWorld[1] * 500,
        aircraftPosition[2] + forwardWorld[2] * 500
      ];
      for (const wing of [-3.4, 3.4]) {
        const muzzleOffset = rotate([wing, -0.75, -1.2]);
        const px = aircraftPosition[0] + muzzleOffset[0];
        const py = aircraftPosition[1] + muzzleOffset[1];
        const pz = aircraftPosition[2] + muzzleOffset[2];
        const dx = aim[0] - px;
        const dy = aim[1] - py;
        const dz = aim[2] - pz;
        const inv = 380 / Math.hypot(dx, dy, dz);
        const tracer = control.tracers[control.nextTracer % TRACER_POOL]!;
        const tracerIndex = control.nextTracer % TRACER_POOL;
        control.nextTracer += 1;
        tracer.life = 0.6;
        tracer.px = px;
        tracer.py = py;
        tracer.pz = pz;
        tracer.vx = dx * inv + velocityNow[0] * 0.6;
        tracer.vy = dy * inv + velocityNow[1] * 0.6;
        tracer.vz = dz * inv + velocityNow[2] * 0.6;
        // Point the stretched tracer along its flight path once at spawn.
        const speed2 = Math.hypot(tracer.vx, tracer.vy, tracer.vz);
        const dirX = tracer.vx / speed2;
        const dirY = tracer.vy / speed2;
        const dirZ = tracer.vz / speed2;
        const yawAngle = Math.atan2(-dirX, -dirZ);
        const pitchAngle = Math.asin(Mathf.clamp(dirY, -1, 1));
        const cy = Math.cos(yawAngle / 2);
        const sy = Math.sin(yawAngle / 2);
        const cp = Math.cos(pitchAngle / 2);
        const sp = Math.sin(pitchAngle / 2);
        const tracerEntity = context.entity(`tracer.${String(tracerIndex).padStart(2, "0")}`);
        tracerEntity?.patch("Transform", {
          rotation: [sp * cy, sy * cp, -sy * sp, cy * cp]
        });
      }
      control.muzzleFlash = 0.055;
      const smokeSlot = control.nextSmoke % 4;
      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const puff = control.smokePuffs[sideIndex * 4 + smokeSlot]!;
        const seed = control.nextSmoke * 2 + sideIndex + 1;
        const noise = Math.sin(seed * 12.9898) * 43758.5453;
        const variation = noise - Math.floor(noise);
        puff.life = 0.38;
        puff.driftX = (variation - 0.5) * 0.055;
        puff.driftY = 0.018 + variation * 0.035;
        puff.twist = (variation - 0.5) * 2.6;
      }
      control.nextSmoke += 1;
      control.gunRecoil = 1;
    }
    control.muzzleFlash = Math.max(0, control.muzzleFlash - dt);
    const flashPhase = Mathf.clamp(control.muzzleFlash / 0.055, 0, 1);
    const flashEnvelope = Math.sin(flashPhase * Math.PI);
    const flashWidth = control.muzzleFlash > 0 ? 0.17 + flashEnvelope * 0.1 : 0.001;
    const flashLength = control.muzzleFlash > 0 ? 0.5 + flashEnvelope * 0.22 : 0.001;
    for (const side of ["left", "right"]) {
      context.entity(`muzzle.${side}`)?.patch("Transform", {
        scale: [flashWidth, flashWidth, flashLength]
      });
    }
    for (let index = 0; index < control.smokePuffs.length; index += 1) {
      const puff = control.smokePuffs[index]!;
      puff.life = Math.max(0, puff.life - dt);
      const smokeAge = 1 - Mathf.clamp(puff.life / 0.38, 0, 1);
      const smokeEnvelope = puff.life > 0 ? Math.sin(smokeAge * Math.PI) : 0;
      const smokeScale = puff.life > 0
        ? smokeEnvelope * (0.11 + smokeAge * 0.2)
        : 0.001;
      const left = index < 4;
      const slot = index % 4;
      const halfTwist = (puff.twist + smokeAge * (left ? 1.2 : -1.2)) / 2;
      context.entity(`smoke.${left ? "left" : "right"}.${slot}`)?.patch("Transform", {
        position: [
          (left ? 0.5375 : -0.5375) + puff.driftX * smokeAge,
          -0.15 - puff.driftY * smokeAge,
          0.13 - smokeAge * 0.19
        ],
        rotation: [Math.sin(halfTwist), Math.cos(halfTwist), 0, 0],
        scale: [smokeScale * (0.78 + smokeAge * 0.32), smokeScale, smokeScale]
      });
    }
    for (let index = 0; index < control.tracers.length; index += 1) {
      const tracer = control.tracers[index]!;
      const entity = context.entity(`tracer.${String(index).padStart(2, "0")}`);
      if (entity === undefined) continue;
      if (tracer.life > 0) {
        tracer.life -= dt;
        tracer.px += tracer.vx * dt;
        tracer.py += tracer.vy * dt;
        tracer.pz += tracer.vz * dt;
        if (tracer.life <= 0 || tracer.py < 1) {
          tracer.life = 0;
          tracer.py = -9999;
        }
        entity.patch("Transform", { position: [tracer.px, tracer.py, tracer.pz] });
      }
    }

    const bankTarget = roll * 0.45;
    control.visualBank += (bankTarget - control.visualBank) * Mathf.clamp(dt * 4, 0, 1);
    // Compose the cosmetic bank with the model's authored 180-degree yaw
    // ([0,1,0,0]): yaw180 * rollZ(bank) = [sin(b/2), cos(b/2), 0, 0].
    const halfBank = control.visualBank / 2;
    visual.patch("Transform", {
      position: [0, 0, control.gunRecoil * 0.012],
      rotation: [Math.sin(halfBank), Math.cos(halfBank), 0, 0]
    });
    const camera = context.entity("camera.main");
    if (camera !== undefined) {
      const shake = control.gunRecoil * 0.025;
      camera.patch("Transform", {
        position: [
          Math.sin(context.time.elapsed * 137) * shake,
          4.6 + Math.cos(context.time.elapsed * 113) * shake,
          15 + control.gunRecoil * 0.045
        ]
      });
    }

    // Propeller speed follows throttle: near-idle shows readable blades,
    // full power spins into a strobe hidden behind the translucent blur disc.
    const propSpeed = 1.5 + control.throttle * 35;
    const discTarget = Mathf.clamp((control.throttle - 0.3) / 0.35, 0, 1);
    control.discBlend += (discTarget - control.discBlend) * Mathf.clamp(dt * 3, 0, 1);
    const disc = context.entity("aircraft.propdisc");
    if (disc !== undefined) {
      const discScale = Math.max(0.001, control.discBlend) * 0.5;
      disc.patch("Transform", {
        scale: [discScale, 0.012, discScale]
      });
    }

    const transitionActive = context.time.elapsed < control.flapTransitionUntil;
    let clip = "flight.cruise";
    let clipLoop = true;
    let clipSpeed = propSpeed;
    if (transitionActive) {
      clip = control.retracting ? "flight.flaps-retract" : "flight.flaps";
      clipLoop = false;
      clipSpeed = 1;
    } else if (control.flapsDown) {
      clip = "flight.flaps-down";
      clipSpeed = propSpeed;
    } else if (Math.abs(roll) > 0.18) {
      clip = roll > 0 ? "flight.roll-right" : "flight.roll-left";
      clipSpeed = propSpeed;
    } else if (Math.abs(pitch) > 0.18) {
      clip = pitch > 0 ? "flight.pitch-up" : "flight.pitch-down";
      clipSpeed = propSpeed;
    } else if (Math.abs(yaw) > 0.18) {
      clip = yaw > 0 ? "flight.rudder-right" : "flight.rudder-left";
      clipSpeed = propSpeed;
    }
    context.animation.play("aircraft.visual", clip, {
      activeState: clip,
      loop: clipLoop,
      sourceClip: clip,
      speed: clipSpeed
    });
    control.activeClip = clip;
    const position = aircraft.transform().position;
    const velocity = body.velocity ?? [0, 0, -72];
    const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
    const altitude = position[1];
    const failed = altitude < 5 || (altitude < 22 && speed < 24);
    if (!failed) control.elapsed += dt;
    const complete = control.elapsed >= 45;
    const stall = speed < 36;
    // Fire warning/crash cues on the rising edge only, so they sound once per
    // event rather than every fixed tick the condition stays true.
    if (stall && !control.prevStall) context.audio.play("warning.stall");
    control.prevStall = stall;
    if (failed && control.enginePlaybackId !== "") {
      // Ditching cuts the running engine and spools it down to silence.
      context.audio.stop(control.enginePlaybackId);
      control.enginePlaybackId = "";
      context.audio.play("engine.stop", { volume: 0.75 });
    }
    if (failed) {
      // Cancel any spool-up still in flight and reset the throttle banding so
      // the next retry starts the engine cleanly from scratch.
      control.engineStartAt = -1;
      control.engineBand = -1;
    }
    if (failed && !control.prevFailed) context.audio.play("crash.splash");
    control.prevFailed = failed;
    const phase = failed ? "DITCHED" : stall ? "STALL" : complete ? "PATROL COMPLETE" : "CRUISE";
    const progress = Mathf.clamp(control.elapsed / 45, 0, 1);
    const airspeedKnots = Math.round(speed * 1.94384);
    const altitudeFeet = Math.max(0, Math.round(altitude * 3.28084));
    const throttlePercent = Math.round(control.throttle * 100);
    const objective = failed
      ? "Press R or RETRY FLIGHT"
      : complete
        ? "Maintain patrol altitude"
        : `Controlled flight ${Math.round(control.elapsed)} / 45 sec`;

    context.resources.patch("FlightState", {
      airspeedKnots,
      altitudeFeet,
      flaps: control.flapsDown ? "DOWN" : "UP",
      objective,
      phase,
      progress,
      retryCount: control.retryCount,
      stall,
      throttlePercent
    });
    context.events.emit("flight:telemetry", {
      airspeed: `${airspeedKnots} KT`,
      altitude: `${altitudeFeet} FT`,
      flaps: control.flapsDown ? "DOWN" : "UP",
      objective,
      phase,
      progress,
      stall,
      throttle: `${throttlePercent}%`
    });
  }
);
