import { createOverlayClient } from "@threenative/overlay-client";

export type FlightTelemetry = {
  airspeed: string;
  altitude: string;
  flaps: string;
  integrity: string;
  objective: string;
  phase: string;
  progress: number;
  stall: boolean;
  throttle: string;
};

export type GameToOverlay = {
  "flight:telemetry": FlightTelemetry;
};

export type OverlayToGame = {
  "flight:restart": Record<string, never>;
  "flight:toggle-flaps": Record<string, never>;
};

export const overlayClient = createOverlayClient<GameToOverlay, OverlayToGame>();
