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
    reads: ["RigidBody"],
    resourceReads: ["FlightState"],
    resourceWrites: ["FlightState"],
    schedule: "fixedUpdate",
    services: [
      "animation.play",
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
      elapsed: 0,
      flapTransitionUntil: 0,
      flapsDown: false,
      retracting: false,
      retryCount: 0,
      throttle: 0.82,
      visualBank: 0
    });
    const restartFromOverlay = context.events.read("flight:restart").length > 0;
    if (context.input.pressed("retry") || restartFromOverlay) {
      aircraft.patch("Transform", {
        position: [0, 90, 0],
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
        "aileron.left": 0,
        "aileron.right": 0,
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
    const bankTarget = -roll * 0.45;
    control.visualBank += (bankTarget - control.visualBank) * Mathf.clamp(dt * 4, 0, 1);
    const halfBank = control.visualBank / 2;
    visual.patch("Transform", {
      rotation: [0, 0, Math.sin(halfBank), Math.cos(halfBank)]
    });

    const transitionActive = context.time.elapsed < control.flapTransitionUntil;
    let clip = "flight.cruise";
    let clipLoop = true;
    let clipSpeed = 11;
    if (transitionActive) {
      clip = control.retracting ? "flight.flaps-retract" : "flight.flaps";
      clipLoop = false;
      clipSpeed = 1;
    } else if (control.flapsDown) {
      clip = "flight.flaps-down";
      clipSpeed = 11;
    } else if (Math.abs(pitch) > 0.18) {
      clip = pitch > 0 ? "flight.pitch-up" : "flight.pitch-down";
      clipSpeed = 11;
    } else if (Math.abs(yaw) > 0.18) {
      clip = yaw > 0 ? "flight.rudder-right" : "flight.rudder-left";
      clipSpeed = 11;
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
    const stall = speed < 43 || (Math.abs(pitch) > 0.82 && speed < 58);
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
