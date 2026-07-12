import { validateOverlayPayload, type IOverlayIr, type IOverlayMessageDeclaration } from "@threenative/ir/overlays";

export interface IOverlayBridgeEnvelope {
  overlayId: string;
  payload: Record<string, unknown>;
  sequence: number;
  timestamp: number;
  type: string;
}

export interface IOverlayBridgeDiagnostic {
  code: string;
  message: string;
  overlayId: string;
  type?: string;
}

export interface IOverlayBridge {
  diagnostics: IOverlayBridgeDiagnostic[];
  events: IOverlayBridgeEnvelope[];
  publish(overlayId: string, type: string, payload: Record<string, unknown>): boolean;
  send(envelope: Omit<IOverlayBridgeEnvelope, "sequence" | "timestamp">): boolean;
  snapshots: IOverlayBridgeEnvelope[];
}

export function createOverlayBridge(overlays: readonly IOverlayIr[]): IOverlayBridge {
  const overlayById = new Map(overlays.map((overlay) => [overlay.id, overlay]));
  const diagnostics: IOverlayBridgeDiagnostic[] = [];
  const events: IOverlayBridgeEnvelope[] = [];
  const snapshots: IOverlayBridgeEnvelope[] = [];
  let sequence = 0;

  return {
    diagnostics,
    events,
    publish(overlayId, type, payload) {
      const overlay = overlayById.get(overlayId);
      if (overlay === undefined) {
        diagnostics.push({ code: "TN_OVERLAY_UNKNOWN", message: `Overlay '${overlayId}' is not declared.`, overlayId, type });
        return false;
      }
      const message = findMessage(overlay.messages.gameToOverlay ?? [], type);
      const validation = message === undefined ? undefined : validateOverlayPayload(payload, message.schema);
      if (validation?.valid !== true) {
        diagnostics.push({ code: validation?.code ?? "TN_OVERLAY_MESSAGE_REJECTED", message: `Game-to-overlay message '${type}' is not declared, too large, or failed schema validation.`, overlayId, type });
        return false;
      }
      snapshots.push({ overlayId, payload, sequence: ++sequence, timestamp: Date.now(), type });
      if (snapshots.length > 64) {
        snapshots.shift();
      }
      return true;
    },
    send(envelope) {
      const overlay = overlayById.get(envelope.overlayId);
      if (overlay === undefined) {
        diagnostics.push({ code: "TN_OVERLAY_UNKNOWN", message: `Overlay '${envelope.overlayId}' is not declared.`, overlayId: envelope.overlayId, type: envelope.type });
        return false;
      }
      const message = findMessage(overlay.messages.overlayToGame ?? [], envelope.type);
      const validation = message === undefined ? undefined : validateOverlayPayload(envelope.payload, message.schema);
      if (validation?.valid !== true) {
        diagnostics.push({ code: validation?.code ?? "TN_OVERLAY_MESSAGE_REJECTED", message: `Overlay message '${envelope.type}' is not declared, too large, or failed schema validation.`, overlayId: envelope.overlayId, type: envelope.type });
        return false;
      }
      events.push({ ...envelope, sequence: ++sequence, timestamp: Date.now() });
      return true;
    },
    snapshots,
  };
}

function findMessage(messages: readonly IOverlayMessageDeclaration[], type: string): IOverlayMessageDeclaration | undefined {
  return messages.find((message) => message.name === type);
}
