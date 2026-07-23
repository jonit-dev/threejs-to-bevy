import type { ScriptContext } from "@threenative/script-stdlib";

export function updateFlightCourse(context: ScriptContext): void {
  const { camera, craft } = context.entities.byId({ camera: "camera.main", craft: "craft" });
  if (craft === undefined) return;

  const state = context.resources.get("FlightState", {
    altitude: 2,
    events: [] as string[],
    gust: false,
    landed: false,
    objectiveStep: 0,
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
      events: ["retry"],
      gust: false,
      landed: false,
      objectiveStep: 0,
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
        transform.position[0] + 3,
        transform.position[1] + 1.8,
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
  let phase = throttle > 0 ? "launch" : String(state.phase ?? "ready");

  if (throttle > 0 && !takeoff) {
    context.physics.addForce("craft", [0, 650, -450]);
  }
  if (altitude > 4) {
    takeoff = true;
  }
  if (takeoff && transform.position[2] < -18) {
    gust = true;
  }
  if (takeoff && pitch > 0.5) {
    stall = true;
    context.physics.addTorque("craft", [280, 0, 0]);
    context.physics.addForce("craft", [0, -300, 0]);
  }
  if (stall && pitch < -0.5) {
    recovered = true;
    context.physics.addTorque("craft", [-320, 0, 0]);
    context.physics.addForce("craft", [0, 420, 0]);
  }
  if (recovered && pitch === 0 && throttle === 0) {
    context.physics.addForce("craft", [0, altitude > 2.5 ? -1200 : 300, 0]);
    if (altitude <= 2.5) {
      landed = true;
    } else {
      phase = "approach";
    }
  }
  if (altitude < -3) phase = "failed";

  const milestones = [
    { event: "takeoff", reached: takeoff, phase: "takeoff", step: 1 },
    { event: "gust", reached: gust, phase: "gust", step: 2 },
    { event: "stall", reached: stall, phase: "stall", step: 3 },
    { event: "recovery", reached: recovered, phase: "recovery", step: 4 },
    { event: "landing", reached: landed, phase: "landed", step: 5 },
  ] as const;
  const events = Array.isArray(state.events)
    ? state.events.filter((entry): entry is string => typeof entry === "string")
    : [];
  let objectiveStep = 0;
  for (const milestone of milestones) {
    if (!milestone.reached) continue;
    objectiveStep = milestone.step;
    phase = milestone.phase;
    if (!events.includes(milestone.event)) events.push(milestone.event);
  }
  if (recovered && !landed && pitch === 0 && throttle === 0) phase = "approach";
  if (altitude < -3) phase = "failed";

  context.resources.patch("FlightState", {
    altitude,
    events,
    gust,
    landed,
    objectiveStep,
    phase,
    recovered,
    speed,
    stall,
    takeoff,
  });
}
