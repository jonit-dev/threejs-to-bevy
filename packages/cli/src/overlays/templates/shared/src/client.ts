import { createOverlayClient } from "@threenative/overlay-client";

export type GameToOverlay = { "overlay:snapshot": { message: string } };
export type OverlayToGame = { "overlay:action": { action: string } };

export const overlayClient = createOverlayClient<GameToOverlay, OverlayToGame>();
