export interface IGameScaleEntityInput {
  id?: unknown;
  visible?: unknown;
  worldBounds?: {
    size?: unknown;
  };
}

export interface IGameScaleEntityReport {
  height: number;
  id: string;
  roles: string[];
  visible: boolean;
  width: number;
  depth: number;
}

export interface IGameScaleDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
  suggestedFix: string;
}

export interface IGameScaleReport {
  diagnostics: IGameScaleDiagnostic[];
  entities: IGameScaleEntityReport[];
  ok: boolean;
  ratios: Array<{
    baseline: string;
    baselineHeight: number;
    compared: string;
    comparedHeight: number;
    ratio: number;
    rule: string;
  }>;
}

export function analyzeGameScaleEntities(input: readonly IGameScaleEntityInput[]): IGameScaleReport {
  const entities = input
    .map(normalizeScaleEntity)
    .filter((entity): entity is IGameScaleEntityReport => entity !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
  const players = entities.filter((entity) => entity.roles.includes("player"));
  const vehicles = entities.filter((entity) => entity.roles.includes("vehicle"));
  const diagnostics: IGameScaleDiagnostic[] = [];
  const ratios: IGameScaleReport["ratios"] = [];

  for (const player of players) {
    for (const vehicle of vehicles) {
      if (vehicle.height <= 0 || vehicle.id === player.id) {
        continue;
      }
      const ratio = round(player.height / vehicle.height);
      ratios.push({
        baseline: vehicle.id,
        baselineHeight: vehicle.height,
        compared: player.id,
        comparedHeight: player.height,
        ratio,
        rule: "player-height / vehicle-height",
      });
      if (ratio >= 0.85) {
        diagnostics.push({
          code: "TN_GAME_SCALE_PLAYER_OVERSIZED",
          message: `Player '${player.id}' height ${player.height} is ${(ratio * 100).toFixed(1)}% of vehicle '${vehicle.id}' height ${vehicle.height}.`,
          severity: "error",
          suggestedFix: "Reduce the player visual scale, increase the vehicle scale, or adjust camera framing instead of making the player oversized for readability.",
        });
      } else if (ratio < 0.28) {
        diagnostics.push({
          code: "TN_GAME_SCALE_PLAYER_UNDERSIZED",
          message: `Player '${player.id}' height ${player.height} is only ${(ratio * 100).toFixed(1)}% of vehicle '${vehicle.id}' height ${vehicle.height}.`,
          severity: "warning",
          suggestedFix: "Check asset units and transform scale; a humanoid should usually read around one third to two thirds of a vehicle height depending on genre.",
        });
      }
    }
  }

  if (players.length === 0 && vehicles.length === 0) {
    diagnostics.push({
      code: "TN_GAME_SCALE_PLAYER_MISSING",
      message: "No visible player/runner/hero or vehicle-hero entity was found in runtime bounds.",
      severity: "warning",
      suggestedFix: "Use stable entity IDs or metadata that identify the player/hero surface so scale QA can compare it.",
    });
  }
  if (vehicles.length === 0) {
    diagnostics.push({
      code: "TN_GAME_SCALE_VEHICLE_MISSING",
      message: "No visible train/truck/car/vehicle entity was found in runtime bounds.",
      severity: "warning",
      suggestedFix: "For vehicle scenes, use stable entity IDs or metadata that identify the vehicle surface so scale QA can compare it.",
    });
  }

  return {
    diagnostics,
    entities,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    ratios: ratios.sort((left, right) => left.compared.localeCompare(right.compared) || left.baseline.localeCompare(right.baseline)),
  };
}

function normalizeScaleEntity(input: IGameScaleEntityInput): IGameScaleEntityReport | undefined {
  if (typeof input.id !== "string" || input.visible !== true) {
    return undefined;
  }
  const size = input.worldBounds?.size;
  if (!Array.isArray(size) || size.length < 3 || !size.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return undefined;
  }
  const id = input.id;
  return {
    depth: round(Math.abs(size[2] ?? 0)),
    height: round(Math.abs(size[1] ?? 0)),
    id,
    roles: inferScaleRoles(id),
    visible: true,
    width: round(Math.abs(size[0] ?? 0)),
  };
}

function inferScaleRoles(id: string): string[] {
  const normalized = id.toLowerCase();
  const roles: string[] = [];
  if (/\b(player|runner|hero|avatar|character)\b/.test(normalized) || normalized.includes("runner")) {
    roles.push("player");
  }
  if (/\b(train|metro|truck|bus|car|vehicle|van|tram|aircraft|plane|airplane|jet|helicopter|ship|boat|tank)\b/.test(normalized) || normalized.includes("train")) {
    roles.push("vehicle");
  }
  return roles;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
