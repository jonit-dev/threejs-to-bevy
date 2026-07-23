import type { ScriptContext } from "@threenative/script-stdlib";

export function updateFlightCourse(context: ScriptContext): void {
  const { camera, craft } = context.entities.byId({ camera: "camera.main", craft: "craft" });
  if (craft === undefined) return;

  const state = context.resources.get("FlightState", {
    altitude: 2,
    gust: false,
    landed: false,
    phase: "ready",
    recovered: false,
    retryCount: 0,
    speed: 12,
    stall: false,
    takeoff: false,
  });
  if (context.input.getButton("retry")) {
    craft.patch("Transform", { position: [0, 2, 8], rotation: [0, 0, 0, 1] });
    context.physics.setLinearVelocity("craft", [0, 0, -12]);
    context.physics.setAngularVelocity("craft", [0, 0, 0]);
    context.resources.set("FlightState", {
      altitude: 2,
      gust: false,
      landed: false,
      phase: "retry",
      recovered: false,
      retryCount: Number(state.retryCount ?? 0) + 1,
      speed: 12,
      stall: false,
      takeoff: false,
    });
    return;
  }

  const throttle = context.input.getButton("throttle") ? 1 : 0;
  const pitch = context.input.getAxis("pitch");
  context.physics.aerodynamics.setInputs("craft", {
    surfaces: { elevator: pitch },
    thrusters: { "main-engine": throttle },
  });

  const transform = craft.get("Transform", { position: [0, 2, 8] });
  if (camera !== undefined) {
    camera.patch("Transform", {
      position: [
        transform.position[0] + 4,
        transform.position[1] + 2.5,
        transform.position[2] + 5,
      ],
      rotation: [-0.174613, 0.325291, 0.061251, 0.927332],
    });
  }
  const body = craft.get("RigidBody", { velocity: [0, 0, -12] });
  const altitude = transform.position[1];
  const speed = Math.hypot(...(body.velocity ?? [0, 0, 0]));
  let takeoff = Boolean(state.takeoff);
  let gust = Boolean(state.gust);
  let stall = Boolean(state.stall);
  let recovered = Boolean(state.recovered);
  let landed = Boolean(state.landed);
  let phase = String(state.phase ?? "ready");

  if (throttle > 0 && !takeoff) {
    context.physics.addForce("craft", [0, 650, -450]);
  }
  if (altitude > 4) {
    takeoff = true;
    phase = "takeoff";
  }
  if (takeoff && transform.position[2] < -18) {
    gust = true;
    phase = "gust";
  }
  if (takeoff && pitch > 0.5) {
    stall = true;
    phase = "stall";
    context.physics.addTorque("craft", [280, 0, 0]);
    context.physics.addForce("craft", [0, -300, 0]);
  }
  if (stall && pitch < -0.5) {
    recovered = true;
    phase = "recovery";
    context.physics.addTorque("craft", [-320, 0, 0]);
    context.physics.addForce("craft", [0, 420, 0]);
  }
  if (recovered && pitch === 0 && throttle === 0) {
    context.physics.addForce("craft", [0, altitude > 2.5 ? -1200 : 300, 0]);
    if (altitude <= 2.5) {
      landed = true;
      phase = "landed";
    } else {
      phase = "approach";
    }
  }
  if (altitude < -3) phase = "failed";

  context.resources.patch("FlightState", {
    altitude,
    gust,
    landed,
    phase,
    recovered,
    speed,
    stall,
    takeoff,
  });
}
