import {
  AudioCueEx,
  BoresightEx,
  CameraMath,
  defineBehavior,
  FlightRig,
  FxEx,
  GunneryEx,
  HitTestEx,
  Mathf,
  ProjectileEx,
  PropellerEx,
  Quat,
  RandomEx,
  ShipFxEx,
  TimerEx,
  type ScriptContext
} from "@threenative/script-stdlib";

type FlightContext = ScriptContext & {
  events: {
    emit(event: string, payload?: Record<string, unknown>): void;
    read(event: string): unknown[];
  };
};

interface IPacificCombat {
  destroyerHalfX: number;
  destroyerHalfZ: number;
  destroyerMaxY: number;
  destroyerMinY: number;
  flakProximitySq: number;
  playerTracerDamage: number;
  playerTracerPool: number;
}

export const updatePacificFlight = defineBehavior(
  {
    id: "pacific-flight",
    eventReads: ["flight:restart", "flight:toggle-flaps"],
    eventWrites: ["flight:telemetry"],
    reads: ["Health", "RigidBody", "Transform"],
    resourceReads: ["FlightState", "PacificCombat"],
    resourceWrites: ["FlightState"],
    schedule: "fixedUpdate",
    services: [
      "animation.play",
      "audio.play",
      "audio.stop",
      "audio.update",
      "physics.addTorque",
      "physics.aerodynamics.setInputs",
      "physics.setAngularVelocity",
      "physics.setLinearVelocity"
    ],
    writes: ["Health", "Transform"]
  },
  (rawContext: ScriptContext): void => {
    const context = rawContext as FlightContext;
    const aircraft = context.entity("aircraft");
    const visual = context.entity("aircraft.visual");
    const destroyer = context.entity("enemy.samidare");
    if (aircraft === undefined || visual === undefined || destroyer === undefined) return;
    const combat = context.resources.get<IPacificCombat>("PacificCombat");
    const CRASH_ALTITUDE = 5;
    const MUSH_ALTITUDE = 22;
    const MUSH_SPEED = 24;
    const STALL_SPEED = 36;
    const DESTROYER_EFFECTS = [
      "destroyer.fire.0",
      "destroyer.fire.1",
      "destroyer.smoke.0",
      "destroyer.smoke.1",
      "destroyer.smoke.2",
      "destroyer.smoke.3",
      "destroyer.impact-flash",
      "destroyer.aa-flash.0",
      "destroyer.aa-flash.1"
    ];

    const initialFlightState = () => ({
      activeClip: "",
      aaFireCooldown: 0.8,
      aaHitFlash: 0,
      aaHitsTaken: 0,
      aaMuzzleFlash: 0,
      aaNextTracer: 0,
      aaTracers: ProjectileEx.pool(10),
      flakBursts: Array.from(
        { length: 6 },
        () => ({ life: 0, x: 0, y: -9999, z: 0 })
      ),
      nextFlak: 0,
      playerExplosion: { life: 0, x: 0, y: -9999, z: 0 },
      enginePlaybackId: "",
      engineStartAt: -1,
      engineBand: -1,
      engineBandChangedAt: 0,
      elapsed: 0,
      flapTransitionUntil: 0,
      flapsDown: false,
      retracting: false,
      discBlend: 0,
      destroyerDestroyedAt: -1,
      destroyerHealth: 120,
      destroyerHits: 0,
      fireCooldown: 0,
      gunRecoil: 0,
      impactFlash: 0,
      lastGunSfx: -1,
      muzzleFlash: 0,
      musicStarted: false,
      nextSmoke: 0,
      nextTracer: 0,
      prevFailed: false,
      prevStall: false,
      playerIntegrity: 100,
      retryCount: 0,
      throttle: 0.82,
      smokePuffs: Array.from(
        { length: 8 },
        () => ({ driftX: 0, driftY: 0, life: 0, twist: 0 })
      ),
      tracers: ProjectileEx.pool(combat.playerTracerPool),
      visualBank: 0
    });
    const control = context.state("pacific-flight-control", initialFlightState());

    const restartFromOverlay = context.events.read("flight:restart").length > 0;
    const retryRequested = context.input.pressed("retry") || restartFromOverlay;
    const startEngineLoop = () => {
      return context.audio.play("engine.loop", {
        loop: true,
        volume: 0.45 + 0.35 * control.throttle,
        pitch: 0.85 + 0.35 * control.throttle
      });
    };

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
      const retryCount = control.retryCount + 1;
      const preserved = {
        aaTracers: control.aaTracers,
        discBlend: control.discBlend,
        engineBand: control.engineBand,
        engineBandChangedAt: control.engineBandChangedAt,
        enginePlaybackId: control.enginePlaybackId,
        engineStartAt: control.engineStartAt,
        fireCooldown: control.fireCooldown,
        flakBursts: control.flakBursts,
        gunRecoil: control.gunRecoil,
        lastGunSfx: control.lastGunSfx,
        musicStarted: control.musicStarted,
        muzzleFlash: control.muzzleFlash,
        nextFlak: control.nextFlak,
        nextSmoke: control.nextSmoke,
        nextTracer: control.nextTracer,
        playerExplosion: control.playerExplosion,
        prevFailed: control.prevFailed,
        prevStall: control.prevStall,
        smokePuffs: control.smokePuffs,
        tracers: control.tracers
      };
      Object.assign(control, initialFlightState(), preserved, { retryCount });
      aircraft.patch("Transform", {
        position: [0, 260, 0],
        rotation: [0, 0, 0, 1]
      });
      aircraft.patch("Health", { current: 100, max: 100 });
      context.physics.setLinearVelocity("aircraft", [0, 0, -72]);
      context.physics.setAngularVelocity("aircraft", [0, 0, 0]);
      destroyer.patch("Health", { current: 120, max: 120 });
      destroyer.patch("Transform", {
        position: [0, 4.95, -900],
        rotation: [0, 0, 0, 1]
      });
      for (const effectId of DESTROYER_EFFECTS) {
        context.entity(effectId)?.patch("Transform", {
          position: [0, -100, -900],
          scale: [0.001, 0.001, 0.001]
        });
      }
      for (let index = 0; index < control.aaTracers.length; index += 1) {
        control.aaTracers[index]!.life = 0;
        context.entity(`destroyer.aa.${String(index).padStart(2, "0")}`)?.patch("Transform", {
          position: [0, -100, -900]
        });
      }
      for (let index = 0; index < control.flakBursts.length; index += 1) {
        control.flakBursts[index]!.life = 0;
        for (const suffix of ["", ".flash"]) {
          context.entity(`destroyer.flak.${index}${suffix}`)?.patch("Transform", {
            position: [0, -9999, 0],
            scale: [0.001, 0.001, 0.001]
          });
        }
      }
      control.playerExplosion.life = 0;
      context.entity("player.explosion")?.patch("Transform", {
        position: [0, -9999, 0],
        scale: [0.001, 0.001, 0.001]
      });
      for (const puff of control.smokePuffs) puff.life = 0;
    }

    const dt = context.time.fixedDelta;
    control.playerIntegrity = aircraft.get("Health", { current: 100, max: 100 }).current ?? 100;
    if (context.input.getButton("throttle-up")) {
      control.throttle = Mathf.clamp(control.throttle + dt * 0.22, 0, 1);
    }
    if (context.input.getButton("throttle-down")) {
      control.throttle = Mathf.clamp(control.throttle - dt * 0.22, 0, 1);
    }

    const stepEngineAudio = (): void => {
      // Bring the sustained loop in once the spool-up has taken hold.
      if (control.engineStartAt >= 0 && context.time.elapsed >= control.engineStartAt + 1) {
        const engine = startEngineLoop();
        if (engine.accepted) {
          control.enginePlaybackId = engine.playbackId;
        }
        control.engineStartAt = -1;
      }
      // Absolute targets update the active loop without restarting it. The
      // bounded ramp keeps fixed-step changes smooth and deterministic.
      if (control.enginePlaybackId !== "") {
        context.audio.update(control.enginePlaybackId, {
          pitch: 0.85 + 0.35 * control.throttle,
          rampSeconds: 0.08,
          volume: 0.45 + 0.35 * control.throttle
        });
      }
    };
    stepEngineAudio();

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
    const body = aircraft.get("RigidBody", {
      angularVelocity: [0, 0, 0],
      velocity: [0, 0, -72]
    });
    const angularVelocity = body.angularVelocity ?? [0, 0, 0];
    const velocityNow = body.velocity ?? [0, 0, -72];
    // Wing guns: Space fires paired tracers from the wing roots that converge
    // on the aim point 500 m ahead. Tracer entities are a fixed authored pool
    // recycled by index; inactive rounds park far below the ocean.
    const TRACER_POOL = combat.playerTracerPool;
    const rotation = aircraft.get("Transform", { rotation: [0, 0, 0, 1] as [number, number, number, number] }).rotation ?? [0, 0, 0, 1];
    control.fireCooldown = TimerEx.tick(control.fireCooldown, dt);
    control.gunRecoil = TimerEx.tick(control.gunRecoil, dt * 9);
    const aircraftPosition = aircraft.transform().position;
    if (context.input.getButton("fire") && control.fireCooldown <= 0) {
      // The SBD-3's paired forward Browning guns read as a fast mechanical
      // burst. Visual rounds run faster than the longer recorded audio cue.
      control.fireCooldown = 0.09;
      if (context.time.elapsed - control.lastGunSfx >= 0.34) {
        context.audio.play("guns.burst");
        control.lastGunSfx = context.time.elapsed;
      }
      const forwardWorld = Quat.rotateVec3(rotation, [0, 0, -1]);
      const aim = [
        aircraftPosition[0] + forwardWorld[0] * 500,
        aircraftPosition[1] + forwardWorld[1] * 500,
        aircraftPosition[2] + forwardWorld[2] * 500
      ];
      for (const wing of [-3.4, 3.4]) {
        const muzzleOffset = Quat.rotateVec3(rotation, [wing, -0.75, -1.2]);
        const px = aircraftPosition[0] + muzzleOffset[0];
        const py = aircraftPosition[1] + muzzleOffset[1];
        const pz = aircraftPosition[2] + muzzleOffset[2];
        const aimSolution = GunneryEx.leadPoint(
          [px, py, pz],
          aim,
          [0, 0, 0],
          { maxLead: 0, minLead: 0, speed: 380 }
        );
        const spawned = ProjectileEx.spawn(control.tracers, control.nextTracer, {
          life: 0.6,
          position: [px, py, pz],
          velocity: [
            aimSolution.velocity[0] + velocityNow[0] * 0.6,
            aimSolution.velocity[1] + velocityNow[1] * 0.6,
            aimSolution.velocity[2] + velocityNow[2] * 0.6
          ]
        });
        const tracer = spawned.round;
        const tracerIndex = spawned.index;
        control.nextTracer = spawned.cursor;
        // Point the stretched tracer along its flight path once at spawn.
        const speed2 = Math.hypot(tracer.vx, tracer.vy, tracer.vz);
        const dirX = tracer.vx / speed2;
        const dirY = tracer.vy / speed2;
        const dirZ = tracer.vz / speed2;
        const yawAngle = Math.atan2(-dirX, -dirZ);
        const pitchAngle = Math.asin(Mathf.clamp(dirY, -1, 1));
        const tracerEntity = context.entity(ProjectileEx.entityId("tracer.", tracerIndex, 2));
        tracerEntity?.patch("Transform", {
          rotation: Quat.fromEuler(pitchAngle, yawAngle, 0)
        });
      }
      control.muzzleFlash = 0.055;
      const smokeSlot = control.nextSmoke % 4;
      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const puff = control.smokePuffs[sideIndex * 4 + smokeSlot]!;
        const seed = control.nextSmoke * 2 + sideIndex + 1;
        const variation = RandomEx.sine01(seed);
        puff.life = 0.38;
        puff.driftX = (variation - 0.5) * 0.055;
        puff.driftY = 0.018 + variation * 0.035;
        puff.twist = (variation - 0.5) * 2.6;
      }
      control.nextSmoke += 1;
      control.gunRecoil = 1;
    }
    control.muzzleFlash = TimerEx.tick(control.muzzleFlash, dt);
    const flashPhase = Mathf.clamp(control.muzzleFlash / 0.055, 0, 1);
    const flashEnvelope = FxEx.envelope(flashPhase);
    const flashWidth = control.muzzleFlash > 0 ? 0.17 + flashEnvelope * 0.1 : 0.001;
    const flashLength = control.muzzleFlash > 0 ? 0.5 + flashEnvelope * 0.22 : 0.001;
    for (const side of ["left", "right"]) {
      context.entity(`muzzle.${side}`)?.patch("Transform", {
        scale: [flashWidth, flashWidth, flashLength]
      });
    }
    for (let index = 0; index < control.smokePuffs.length; index += 1) {
      const puff = control.smokePuffs[index]!;
      puff.life = TimerEx.tick(puff.life, dt);
      const smokeAge = 1 - Mathf.clamp(puff.life / 0.38, 0, 1);
      const smokeEnvelope = puff.life > 0 ? FxEx.envelope(smokeAge) : 0;
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
      const entity = context.entity(ProjectileEx.entityId("tracer.", index, 2));
      if (entity === undefined) continue;
      if (tracer.life > 0) {
        ProjectileEx.step(tracer, dt, { floorY: 1 });
        const hitDestroyer = control.destroyerHealth > 0
          && HitTestEx.insideBox(
            [tracer.px, tracer.py, tracer.pz],
            [0, 0, -900],
            {
              halfX: combat.destroyerHalfX,
              halfZ: combat.destroyerHalfZ,
              maxY: combat.destroyerMaxY,
              minY: combat.destroyerMinY
            }
          );
        if (hitDestroyer) {
          tracer.life = 0;
          tracer.py = -9999;
          control.destroyerHealth = Math.max(0, control.destroyerHealth - combat.playerTracerDamage);
          control.destroyerHits += 1;
          control.impactFlash = 0.12;
          destroyer.patch("Health", {
            current: control.destroyerHealth,
            max: 120
          });
          if (control.destroyerHealth === 0 && control.destroyerDestroyedAt < 0) {
            control.destroyerDestroyedAt = context.time.elapsed;
          }
        }
        entity.patch("Transform", { position: [tracer.px, tracer.py, tracer.pz] });
      }
    }

    // The source GLB has no embedded clips. Its combat death is therefore a
    // deterministic portable state transition: hit flash, sustained deck
    // fires and rising smoke, then an authored starboard roll and sink.
    control.impactFlash = TimerEx.tick(control.impactFlash, dt);
    const destroyerFlashEnvelope = FxEx.flash(control.impactFlash, 0.12);
    context.entity("destroyer.impact-flash")?.patch("Transform", {
      position: [0, 22, -900],
      scale: [
        Math.max(0.001, destroyerFlashEnvelope * 8),
        Math.max(0.001, destroyerFlashEnvelope * 5),
        Math.max(0.001, destroyerFlashEnvelope * 8)
      ]
    });
    const targetDestroyed = control.destroyerDestroyedAt >= 0;

    // Samidare's intact AA battery leads the aircraft with an authored,
    // recycled tracer pool. The deterministic sphere test and Health patch
    // are portable across the web and Bevy adapters.
    control.aaFireCooldown = TimerEx.tick(control.aaFireCooldown, dt);
    control.aaMuzzleFlash = TimerEx.tick(control.aaMuzzleFlash, dt);
    control.aaHitFlash = TimerEx.tick(control.aaHitFlash, dt);
    const destroyerPosition = destroyer.transform().position;
    const aaDx = aircraftPosition[0] - destroyerPosition[0];
    const aaDy = aircraftPosition[1] - destroyerPosition[1];
    const aaDz = aircraftPosition[2] - destroyerPosition[2];
    const aaDistance = Math.hypot(aaDx, aaDy, aaDz);
    if (!targetDestroyed && aaDistance <= 1200 && aircraftPosition[1] > 18 && control.aaFireCooldown <= 0) {
      const tracerIndex = control.aaNextTracer % control.aaTracers.length;
      const gunIndex = control.aaNextTracer % 2;
      control.aaNextTracer += 1;
      control.aaFireCooldown = 0.24;
      control.aaMuzzleFlash = 0.07;
      const muzzle: [number, number, number] = [gunIndex === 0 ? -30 : 30, 23, -898];
      // Flak gunnery: each shell is aimed at the predicted intercept point
      // with deterministic dispersion, then time-fuzed to burst there. The
      // burst does the damage, not the shell body, matching real AA fire.
      const leadTime = Mathf.clamp(aaDistance / 280, 0.2, 2.8);
      const seed = control.aaNextTracer;
      const scatter = (offset: number): number => (RandomEx.sine01(seed + offset) - 0.5) * 2;
      const aimSolution = GunneryEx.leadPoint(muzzle, aircraftPosition, velocityNow, {
        leadTime,
        maxLead: 2.8,
        minLead: 0.2,
        scatter: [scatter(1) * 20, scatter(2) * 14, scatter(3) * 20],
        speed: 280
      });
      const aimX = aimSolution.aim[0] - muzzle[0];
      const aimY = aimSolution.aim[1] - muzzle[1];
      const aimZ = aimSolution.aim[2] - muzzle[2];
      const aimLength = Math.max(0.001, Math.hypot(aimX, aimY, aimZ));
      const spawned = ProjectileEx.spawn(control.aaTracers, tracerIndex, {
        life: Mathf.clamp(aimLength / 280, 0.5, 3.5),
        position: muzzle,
        velocity: aimSolution.velocity
      });
      const tracer = spawned.round;
      const dirX = tracer.vx / 280;
      const dirY = tracer.vy / 280;
      const dirZ = tracer.vz / 280;
      const yawAngle = Math.atan2(-dirX, -dirZ);
      const pitchAngle = Math.asin(Mathf.clamp(dirY, -1, 1));
      context.entity(ProjectileEx.entityId("destroyer.aa.", tracerIndex, 2))?.patch("Transform", {
        rotation: Quat.fromEuler(pitchAngle, yawAngle, 0)
      });
    }
    for (let index = 0; index < control.aaTracers.length; index += 1) {
      const tracer = control.aaTracers[index]!;
      const entity = context.entity(ProjectileEx.entityId("destroyer.aa.", index, 2));
      if (entity === undefined) continue;
      if (targetDestroyed) tracer.life = 0;
      if (tracer.life > 0) {
        ProjectileEx.step(tracer, dt, { floorY: Number.NEGATIVE_INFINITY, parkOnExpire: false });
        const hitX = tracer.px - aircraftPosition[0];
        const hitY = tracer.py - aircraftPosition[1];
        const hitZ = tracer.pz - aircraftPosition[2];
        const proximitySq = hitX * hitX + hitY * hitY + hitZ * hitZ;
        // Proximity or time fuze: the shell detonates near the aircraft or at
        // the end of its fuze run, whichever comes first.
        if (proximitySq <= combat.flakProximitySq || tracer.life <= 0) {
          const burst = control.flakBursts[control.nextFlak % control.flakBursts.length]!;
          control.nextFlak += 1;
          burst.life = 0.8;
          burst.x = tracer.px;
          burst.y = tracer.py;
          burst.z = tracer.pz;
          context.audio.play("flak.airburst", {
            volume: 0.82,
            pitch: 0.94 + (control.nextFlak % 3) * 0.05
          });
          const burstDistance = Math.sqrt(proximitySq);
          const burstDamage = burstDistance < 18 ? 9 : burstDistance < 34 ? 4 : 0;
          if (burstDamage > 0 && control.playerIntegrity > 0) {
            control.playerIntegrity = Math.max(0, control.playerIntegrity - burstDamage);
            control.aaHitsTaken += 1;
            control.aaHitFlash = 0.18;
            aircraft.patch("Health", { current: control.playerIntegrity, max: 100 });
          }
          tracer.life = 0;
        }
      }
      if (tracer.life <= 0 || tracer.py < 1) {
        tracer.life = 0;
        tracer.py = -9999;
      }
      entity.patch("Transform", { position: [tracer.px, tracer.py, tracer.pz] });
    }
    // Flak is a layered transparent VFX: a brief hot flash gives way to an
    // expanding charcoal smoke bloom. The cards stay visually soft instead of
    // reading as a solid shell or sculpted 3D object.
    for (let index = 0; index < control.flakBursts.length; index += 1) {
      const burst = control.flakBursts[index]!;
      const smoke = context.entity(`destroyer.flak.${index}`);
      const flash = context.entity(`destroyer.flak.${index}.flash`);
      if (smoke === undefined || flash === undefined) continue;
      if (burst.life > 0) {
        burst.life = TimerEx.tick(burst.life, dt);
        const age = 1 - burst.life / 0.8;
        const smokeRise = age * 4;
        const smokeSize = 2.5 + Math.sin(Math.min(1, age) * Math.PI * 0.5) * 10;
        const flashPulse = age < 0.28
          ? FxEx.envelope(age / 0.28) * 7
          : 0.001;
        smoke.patch("Transform", {
          position: [burst.x, burst.y + smokeRise, burst.z],
          scale: [smokeSize, smokeSize, 1]
        });
        flash.patch("Transform", {
          position: [burst.x, burst.y + 0.3 + smokeRise * 0.35, burst.z + 0.15],
          scale: [Math.max(0.001, flashPulse), Math.max(0.001, flashPulse), 1]
        });
      } else {
        smoke.patch("Transform", FxEx.parkPose());
        flash.patch("Transform", FxEx.parkPose());
      }
    }
    const aaFlash = control.aaMuzzleFlash > 0
      ? FxEx.flash(control.aaMuzzleFlash, 0.07) * 2.8
      : 0.001;
    for (let index = 0; index < 2; index += 1) {
      context.entity(`destroyer.aa-flash.${index}`)?.patch("Transform", {
        position: [index === 0 ? -30 : 30, 23, -898],
        scale: [Math.max(0.001, aaFlash), Math.max(0.001, aaFlash), Math.max(0.001, aaFlash)]
      });
    }

    if (targetDestroyed) {
      const destroyedTime = context.time.elapsed - control.destroyerDestroyedAt;
      const sink = Mathf.clamp(destroyedTime / 10, 0, 1);
      destroyer.patch("Transform", ShipFxEx.sinkPose([0, 4.95, -900], destroyedTime, {
        drift: 7,
        roll: 0.52,
        rollDuration: 7,
        sinkDepth: 22,
        sinkDuration: 10
      }));
      for (let index = 0; index < 2; index += 1) {
        const pulse = FxEx.pulse(context.time.elapsed, 7.5 + index, 0.82, 0.18, index * 2.1);
        // The burning oil slick outlives the hull: fires settle to half
        // strength and keep marking the wreck instead of fading out.
        const fireFade = 1 - Mathf.clamp((destroyedTime - 12) / 8, 0, 0.5);
        const fireScale = pulse * fireFade;
        context.entity(`destroyer.fire.${index}`)?.patch("Transform", {
          position: [
            index === 0 ? -28 : 24,
            17 - sink * 5 + index * 3,
            -900 + index * 2
          ],
          scale: [
            Math.max(0.001, fireScale * (16 + index * 3)),
            Math.max(0.001, fireScale * (24 + index * 4)),
            1
          ]
        });
      }
      for (let index = 0; index < 4; index += 1) {
        const cycle = (destroyedTime * 0.2 + index * 0.24) % 1;
        const smokeScale = (5 + cycle * 18) * FxEx.envelope(cycle);
        const sideDrift = Math.sin(destroyedTime * 0.7 + index * 1.9) * (2 + cycle * 7);
        const halfTwist = Math.sin(destroyedTime * 0.15 + index) * 0.25;
        context.entity(`destroyer.smoke.${index}`)?.patch("Transform", {
          position: [
            (index % 2 === 0 ? -28 : 24) + sideDrift,
            20 + cycle * 42 - sink * 6,
            -900 + (index % 2) * 2
          ],
          rotation: [0, 0, Math.sin(halfTwist), Math.cos(halfTwist)],
          scale: [
            Math.max(0.001, smokeScale * 0.8),
            Math.max(0.001, smokeScale),
            1
          ]
        });
      }
    }

    const flightPosition = aircraft.transform().position;
    const flight = FlightRig.step(
      {
        elapsed: control.elapsed,
        failed: control.prevFailed,
        phase: control.prevFailed ? "ditched" : control.prevStall ? "stall" : "cruise",
        retryCount: control.retryCount,
        stall: control.prevStall,
        throttle: control.throttle
      },
      { pitch, roll, yaw },
      {
        altitude: flightPosition[1],
        angularVelocity,
        dt,
        integrity: control.playerIntegrity,
        velocity: velocityNow
      },
      {
        aileronLeft: "aileron.left",
        aileronRight: "aileron.right",
        elevator: "elevator",
        thruster: "wright-r1820"
      },
      {
        completeAfter: 45,
        ditchAltitude: CRASH_ALTITUDE,
        ditchMushAltitude: MUSH_ALTITUDE,
        ditchMushSpeed: MUSH_SPEED,
        elevatorSign: -1,
        initialThrottle: 0.82,
        stallSpeed: STALL_SPEED,
        throttleRate: 0,
        turnGains: {
          pitchDamping: 30_000,
          rollDamping: 55_000,
          yawAuthority: 14_000,
          yawDamping: 25_000
        },
        yawMix: 0.7
      }
    );
    flight.controls.surfaces.flaps = control.flapsDown ? 1 : 0;
    context.physics.aerodynamics.setInputs("aircraft", flight.controls);
    context.physics.addTorque("aircraft", flight.torque);
    if (Math.abs(angularVelocity[1]) > 0.0005) {
      context.physics.setLinearVelocity("aircraft", flight.velocity);
    }
    control.elapsed = flight.state.elapsed;

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
      const shake = control.gunRecoil * 0.025 + control.aaHitFlash * 0.28;
      const shakeOffset = CameraMath.oscillatingOffset(
        context.time.elapsed,
        [shake, shake, 0],
        [137, 113, 0],
        [0, Math.PI / 2, 0]
      );
      camera.patch("Transform", {
        position: [
          shakeOffset[0],
          4.6 + shakeOffset[1],
          15 + control.gunRecoil * 0.045 + control.aaHitFlash * 0.35
        ]
      });
    }

    // Propeller speed follows throttle: near-idle shows readable blades,
    // full power spins into a strobe hidden behind the translucent blur disc.
    const propeller = PropellerEx.step(control.discBlend, control.throttle, dt);
    const propSpeed = propeller.clipSpeed;
    control.discBlend = propeller.discBlend;
    const disc = context.entity("aircraft.propdisc");
    if (disc !== undefined) {
      disc.patch("Transform", {
        scale: [propeller.discScale, 0.012, propeller.discScale]
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
    const speed = flight.telemetry.speed;
    const altitude = position[1];
    const failed = flight.telemetry.failed;
    const complete = flight.telemetry.complete;
    const stall = flight.telemetry.stall;
    // Fire warning/crash cues on the rising edge only, so they sound once per
    // event rather than every fixed tick the condition stays true.
    const stallCue = AudioCueEx.rising(control.prevStall, stall);
    if (stallCue.fire) context.audio.play("warning.stall");
    control.prevStall = stallCue.nextActive;
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
    if (failed && !control.prevFailed) {
      context.audio.play("crash.splash");
      // Going in — sea impact or airframe loss reads as a fireball at the
      // aircraft, not a quiet state change.
      control.playerExplosion.life = 0.7;
      control.playerExplosion.x = position[0];
      control.playerExplosion.y = Math.max(3, position[1]);
      control.playerExplosion.z = position[2];
    }
    control.prevFailed = failed;
    const playerExplosion = control.playerExplosion;
    const explosionEntity = context.entity("player.explosion");
    if (explosionEntity !== undefined) {
      if (playerExplosion.life > 0) {
        const fireball = FxEx.fireball(playerExplosion, dt, {
          duration: 0.7,
          grow: 10,
          rise: 5,
          startSize: 8
        });
        playerExplosion.life = fireball.life;
        explosionEntity.patch("Transform", {
          position: fireball.position,
          scale: fireball.scale
        });
      } else {
        explosionEntity.patch("Transform", FxEx.parkPose());
      }
    }
    // Airframe fire: below 40% integrity the wings trail flame that grows as
    // damage worsens.
    const integrityBurn = control.playerIntegrity <= 40 && !failed
      ? (1 - control.playerIntegrity / 40) * FxEx.pulse(context.time.elapsed, 9)
      : 0;
    for (const side of ["left", "right"]) {
      context.entity(`aircraft.fire.${side}`)?.patch("Transform", {
        scale: [
          Math.max(0.001, integrityBurn * 1.6),
          Math.max(0.001, integrityBurn * 2.4),
          1
        ]
      });
    }
    const phase = failed
      ? control.playerIntegrity <= 0
        ? "SHOT DOWN"
        : "DITCHED"
      : stall
        ? "STALL"
        : targetDestroyed
          ? "TARGET DESTROYED"
          : complete
            ? "PATROL COMPLETE"
            : "CRUISE";
    const flightProgress = Mathf.clamp(control.elapsed / 45, 0, 1);
    const damageProgress = 1 - control.destroyerHealth / 120;
    const progress = Math.max(flightProgress, damageProgress);
    const airspeedKnots = Math.round(speed * 1.94384);
    const altitudeFeet = Math.max(0, Math.round(altitude * 3.28084));
    const throttlePercent = Math.round(control.throttle * 100);
    const projectionCamera = context.entity("camera.main");
    const cameraComponent = projectionCamera?.get("Camera", { fovY: 52 });
    const cameraTransform = projectionCamera?.get("Transform", {
      rotation: [-0.090633, 0, 0, 0.995884] as [number, number, number, number]
    });
    const cameraRotation = cameraTransform?.rotation ?? [-0.090633, 0, 0, 0.995884];
    const cameraPitch = Math.asin(Mathf.clamp(
      2 * (cameraRotation[3] * cameraRotation[0] - cameraRotation[1] * cameraRotation[2]),
      -1,
      1
    ));
    const boresight = BoresightEx.project({
      aim: [0, 0, -1],
      aspect: 1280 / 720,
      cameraPitch,
      verticalFov: (cameraComponent?.fovY ?? 52) * Math.PI / 180
    });
    const objective = failed
      ? control.playerIntegrity <= 0
        ? "Zero got you - press R or RETRY FLIGHT"
        : "Press R or RETRY FLIGHT"
      : targetDestroyed
        ? "IJN Samidare destroyed - return to patrol"
        : complete
        ? "Maintain patrol altitude"
        : `Destroy IJN Samidare - hull ${control.destroyerHealth} / 120`;

    context.resources.patch("FlightState", {
      aaHitsTaken: control.aaHitsTaken,
      airspeedKnots,
      altitudeFeet,
      enemyHealth: control.destroyerHealth,
      enemyStatus: targetDestroyed ? "SINKING" : control.destroyerHealth < 120 ? "DAMAGED" : "COMBAT READY",
      flaps: control.flapsDown ? "DOWN" : "UP",
      objective,
      phase,
      playerIntegrity: control.playerIntegrity,
      progress,
      retryCount: control.retryCount,
      stall,
      targetDestroyed,
      throttlePercent
    });
    context.events.emit("flight:telemetry", {
      airspeed: `${airspeedKnots} KT`,
      altitude: `${altitudeFeet} FT`,
      flaps: control.flapsDown ? "DOWN" : "UP",
      integrity: `${Math.round(control.playerIntegrity)}%`,
      objective,
      phase,
      progress,
      reticleVisible: boresight.visible,
      reticleX: boresight.x,
      reticleY: boresight.y,
      stall,
      throttle: `${throttlePercent}%`
    });
  }
);
