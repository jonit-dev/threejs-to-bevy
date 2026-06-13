export interface IV2ArenaSmokeCheck {
  capability: "audio" | "collision" | "hud" | "input" | "movement" | "native";
  status: "pass" | "fail";
}

export interface IV2ArenaSmokeReport {
  checks: IV2ArenaSmokeCheck[];
  code: "TN_V2_ARENA_SMOKE_OK" | "TN_V2_ARENA_SMOKE_FAILED";
  status: "pass" | "fail";
}

export function reportV2ArenaSmoke(checks: IV2ArenaSmokeCheck[]): IV2ArenaSmokeReport {
  const status = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  return {
    checks,
    code: status === "pass" ? "TN_V2_ARENA_SMOKE_OK" : "TN_V2_ARENA_SMOKE_FAILED",
    status,
  };
}

export function expectedV2ArenaSmokeReport(): IV2ArenaSmokeReport {
  return reportV2ArenaSmoke([
    { capability: "input", status: "pass" },
    { capability: "movement", status: "pass" },
    { capability: "collision", status: "pass" },
    { capability: "hud", status: "pass" },
    { capability: "audio", status: "pass" },
    { capability: "native", status: "pass" },
  ]);
}
