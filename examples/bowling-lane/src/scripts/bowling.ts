import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function bowlingLaneSystem(context: ScriptContext): void {
  const delta = context.time.fixedDelta({ fallback: 1 / 60, max: 1 / 30, min: 0.001 });
  const ballEntity = context.query().find((entity: any) => entity.id === "bowling.ball");
  if (ballEntity === undefined) {
    return;
  }

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
  const readState = (): Record<string, unknown> => {
    const value = context.resources?.get?.("BowlingState");
    return isRecord(value) ? value : {};
  };

  let bowlingState = readState();
  const legacyState = context.resource?.("BowlingState");
  const patchState = (patch: Record<string, unknown>): void => {
    bowlingState = { ...bowlingState, ...patch };
    context.resources?.set?.("BowlingState", bowlingState);
    legacyState?.patch?.(patch);
  };
  const existingPinHomes = isRecord(bowlingState.pinHomes) ? bowlingState.pinHomes : {};
  const pinHomes: Record<string, Vec3Tuple> = {};
  let pinHomesChanged = !isRecord(bowlingState.pinHomes);
  for (const entity of context.query()) {
    if (entity.get?.("Pin") === undefined) {
      continue;
    }
    const current = existingPinHomes[entity.id];
    if (isVec3(current)) {
      pinHomes[entity.id] = current;
      continue;
    }
    pinHomes[entity.id] = entity.transform().positionOr([0, 0.58, -3.35]);
    pinHomesChanged = true;
  }
  if (pinHomesChanged) {
    patchState({ pinHomes });
  }

  const ballTransform = ballEntity.transform();
  const ball = ballEntity.get?.("BowlingBall") ?? { speed: 0, aim: 0, rolling: false };
  const position = ballTransform.positionOr([0, 0.28, 4.8]);
  const elapsed = typeof context.time.elapsed === "number" ? context.time.elapsed : 0;
  const aimInput =
    Number(context.input.action("aim-right") ? 1 : 0) -
    Number(context.input.action("aim-left") ? 1 : 0);
  const aiming = !ball.rolling;
  const aim = aiming ? NumberEx.clamp((ball.aim ?? 0) + aimInput * delta * 1.35, -0.72, 0.72) : (ball.aim ?? 0);
  const shouldRoll = (context.input.pressed("roll") || context.input.action("roll") || elapsed > 0.48) && !ball.rolling;
  const shouldReset = context.input.action("reset") || position[2] < -5.25;

  if (shouldReset) {
    ballTransform.setPosition([0, 0.28, 4.8]);
    ballEntity.patch?.("BowlingBall", { speed: 0, aim: 0, rolling: false });
    let resetCount = 0;
    for (const entity of context.query()) {
      const pin = entity.get?.("Pin");
      if (pin === undefined) {
        continue;
      }
      const home = pinHomes[entity.id] ?? entity.transform().positionOr([0, 0.58, -3.35]);
      entity.transform().setPosition(home);
      entity.transform().setRotation([0, 0, 0]);
      entity.patch?.("Pin", { ...pin, standing: true });
      resetCount += 1;
    }
    patchState({ status: "Rack reset. Aim, then roll", scoreText: `Pins: 0/${resetCount}`, knocked: 0, aim: 0 });
    return;
  }

  if (shouldRoll) {
    ballEntity.patch?.("BowlingBall", { speed: 7.2, aim, rolling: true });
    patchState({ status: "Rolling", aim });
    return;
  }

  if (!ball.rolling) {
    const idleBob = Math.sin(elapsed * 3.1) * 0.018;
    ballTransform.setPosition(Vec3.round([aim, 0.28 + idleBob, 4.8], 6));
    ballEntity.patch?.("BowlingBall", { ...ball, aim });
    patchState({ status: `Aim ${Math.round(aim * 100)}`, aim });
    return;
  }

  const speed = Math.max(0, (ball.speed ?? 0) - delta * 0.78);
  const next = Vec3.round([position[0] + aim * delta * 0.7, 0.28, position[2] - speed * delta], 6);
  ballTransform.setPosition(next);
  ballEntity.patch?.("BowlingBall", { speed, aim, rolling: speed > 0.12 });

  let knocked = 0;
  let total = 0;
  for (const entity of context.query()) {
    const pin = entity.get?.("Pin");
    if (pin === undefined) {
      continue;
    }
    total += 1;
    const pinTransform = entity.transform();
    const pinPosition = pinTransform.positionOr(pinHomes[entity.id] ?? [0, 0.58, -3.35]);
    const dx = pinPosition[0] - next[0];
    const dz = pinPosition[2] - next[2];
    const impact = Math.sqrt(dx * dx + dz * dz);
    const alreadyDown = pin.standing === false;
    if (!alreadyDown && impact < 0.42) {
      const side = dx >= 0 ? 1 : -1;
      pinTransform.setPosition(Vec3.round([pinPosition[0] + side * 0.28, 0.22, pinPosition[2] - 0.22], 6));
      pinTransform.setRotation([0.85, 0, side * 0.38]);
      entity.patch?.("Pin", { ...pin, standing: false });
    }
    const updatedPin = entity.get?.("Pin") ?? pin;
    if (updatedPin.standing === false) {
      knocked += 1;
    }
  }

  const done = knocked >= total && total > 0;
  const status = done ? "Strike" : speed > 0.12 ? "Rolling" : "Press R to reset";
  patchState({ status, scoreText: `Pins: ${knocked}/${total}`, knocked, aim });
}
