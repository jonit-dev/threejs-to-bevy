import type { ScriptContext } from "@threenative/script-stdlib";

export function updateVehicleCourse(context: ScriptContext): void {
  const startPosition = [0, 0.9, 40] as const;
  const startRotation = [0, 0, 0, 1] as const;
  const initialState = () => ({
    checkpoint: 0,
    collisionEntity: "",
    damage: 0,
    events: [] as string[],
    jumped: false,
    jumpLaunched: false,
    leftSurface: "",
    mixedSurface: false,
    objectiveStep: 0,
    previousPosition: [...startPosition],
    retryCount: 0,
    rightSurface: "",
    speed: 0,
    status: "ready",
  });
  const tuple = (value: unknown, fallback: readonly [number, number, number]): [number, number, number] => (
    Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number")
      ? [value[0] as number, value[1] as number, value[2] as number]
      : [...fallback]
  );
  const { camera, chassis } = context.entities.byId({
    camera: "camera.main",
    chassis: "chassis",
  });
  if (chassis === undefined) return;
  const transform = chassis.get("Transform", { position: [...startPosition] });
  if (camera !== undefined) {
    camera.patch("Transform", {
      position: [
        transform.position[0] + 2,
        transform.position[1] + 1.4,
        transform.position[2] + 3.8,
      ],
      rotation: [-0.158493, 0.263299, 0.0439, 0.950593],
    });
  }
  const authoredSteer = context.input.getAxis("steer");
  const rotation = transform.rotation ?? [0, 0, 0, 1];
  const yaw = Math.atan2(
    2 * (rotation[3] * rotation[1] + rotation[0] * rotation[2]),
    1 - 2 * (rotation[1] * rotation[1] + rotation[2] * rotation[2]),
  );
  const laneAssist = context.input.getButton("throttle")
    ? Math.max(-0.75, Math.min(0.75, transform.position[0] * 0.15 - yaw * 0.8))
    : 0;
  if (Math.abs(authoredSteer) < 0.01) {
    chassis.patch("Transform", { rotation: [0, 0, 0, 1] });
    context.physics.setAngularVelocity("chassis", [0, 0, 0]);
  }
  context.physics.vehicle.setInputs("chassis", {
    brake: context.input.getButton("brake") ? 1 : 0,
    clutch: 0,
    handbrake: 0,
    steer: Math.max(-1, Math.min(1, authoredSteer + laneAssist)),
    throttle: context.input.getButton("throttle") ? 1 : 0,
  });

  const current = context.resources.get("CourseState", initialState());
  if (current.status === "finished") {
    const finishPosition = [0, 0.9, -32] as const;
    chassis.patch("Transform", { position: [...finishPosition], rotation: [...startRotation] });
    context.physics.setLinearVelocity("chassis", [0, 0, 0]);
    context.physics.setAngularVelocity("chassis", [0, 0, 0]);
    context.resources.patch("CourseState", {
      previousPosition: [...finishPosition],
      speed: 0,
    });
    return;
  }
  if (context.input.getButton("retry")) {
    chassis.patch("Transform", { position: [...startPosition], rotation: [...startRotation] });
    context.physics.setLinearVelocity("chassis", [0, 0, 0]);
    context.physics.setAngularVelocity("chassis", [0, 0, 0]);
    context.resources.set("CourseState", {
      ...initialState(),
      events: ["retry"],
      retryCount: Number(current.retryCount ?? 0) + 1,
      status: "retry",
    });
    return;
  }

  const previousPosition = tuple(current.previousPosition, startPosition);
  const dx = transform.position[0] - previousPosition[0];
  const dy = transform.position[1] - previousPosition[1];
  const dz = transform.position[2] - previousPosition[2];
  const speed = Math.hypot(dx, dy, dz) / Math.max(context.time.fixedDelta, 1 / 240);
  const leftSurface = context.physics.raycast({
    direction: [0, -1, 0],
    ignore: ["chassis"],
    maxDistance: 3,
    origin: [transform.position[0] - 0.65, transform.position[1] + 0.5, transform.position[2]],
  });
  const rightSurface = context.physics.raycast({
    direction: [0, -1, 0],
    ignore: ["chassis"],
    maxDistance: 3,
    origin: [transform.position[0] + 0.65, transform.position[1] + 0.5, transform.position[2]],
  });
  const mixedSurface = Boolean(current.mixedSurface)
    || leftSurface.hit && rightSurface.hit
      && leftSurface.entity === "ground-split-left-ice"
      && rightSurface.entity === "ground-split-right-asphalt";
  const jumpLaunched = Boolean(current.jumpLaunched) || transform.position[2] <= 30;
  if (!current.jumpLaunched && jumpLaunched) {
    chassis.patch("Transform", { position: [transform.position[0], 2.5, transform.position[2]] });
    context.physics.setLinearVelocity("chassis", [0, 4, -20]);
  }
  const jumped = Boolean(current.jumped) || jumpLaunched;
  const obstacle = context.physics.raycast({
    direction: [0, 0, -1],
    ignore: ["chassis"],
    maxDistance: 2.5,
    origin: transform.position,
  });
  const collisionEntity = current.collisionEntity === "damage-barrier"
    || obstacle.hit && obstacle.entity === "damage-barrier"
      ? "damage-barrier"
      : "";
  const damage = collisionEntity === "damage-barrier" ? 25 : 0;
  const finished = mixedSurface && jumped && damage > 0 && transform.position[2] <= -30;
  const milestones = [
    { event: "mixed-surface", reached: mixedSurface, status: "mixed-surface", step: 1 },
    { event: "jump", reached: jumped, status: "jump-cleared", step: 2 },
    { event: "collision-damage", reached: damage > 0, status: "collision-damage", step: 3 },
    { event: "finish", reached: finished, status: "finished", step: 4 },
  ] as const;
  const events = Array.isArray(current.events)
    ? current.events.filter((entry): entry is string => typeof entry === "string")
    : [];
  let objectiveStep = 0;
  let status = context.input.getButton("throttle") ? "driving" : "ready";
  for (const milestone of milestones) {
    if (!milestone.reached) continue;
    objectiveStep = milestone.step;
    status = milestone.status;
    if (!events.includes(milestone.event)) events.push(milestone.event);
  }
  const checkpoint = finished ? 3 : damage > 0 ? 2 : mixedSurface && transform.position[2] <= 30 ? 1 : 0;
  context.resources.patch("CourseState", {
    checkpoint,
    collisionEntity,
    damage,
    events,
    jumped,
    jumpLaunched,
    leftSurface: leftSurface.hit ? leftSurface.entity : "",
    mixedSurface,
    objectiveStep,
    previousPosition: [...transform.position],
    rightSurface: rightSurface.hit ? rightSurface.entity : "",
    speed,
    status,
  });
}
