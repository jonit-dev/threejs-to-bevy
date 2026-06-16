import type { IOverlayIr, IOverlayMessageDeclaration, IOverlayMessageSchema } from "@threenative/ir";

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

const MAX_PAYLOAD_BYTES = 16 * 1024;

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
      if (message === undefined || !validatePayload(payload, message.schema)) {
        diagnostics.push({ code: "TN_OVERLAY_MESSAGE_REJECTED", message: `Game-to-overlay message '${type}' is not declared or failed schema validation.`, overlayId, type });
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
      if (message === undefined || !validatePayload(envelope.payload, message.schema) || JSON.stringify(envelope.payload).length > MAX_PAYLOAD_BYTES) {
        diagnostics.push({ code: "TN_OVERLAY_MESSAGE_REJECTED", message: `Overlay message '${envelope.type}' is not declared, too large, or failed schema validation.`, overlayId: envelope.overlayId, type: envelope.type });
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

function validatePayload(payload: unknown, schema: IOverlayMessageSchema): payload is Record<string, unknown> {
  if (schema.kind !== "object" || typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return false;
  }
  const fields = schema.fields ?? {};
  const record = payload as Record<string, unknown>;
  for (const required of schema.required ?? []) {
    if (!(required in record)) {
      return false;
    }
  }
  for (const [key, value] of Object.entries(record)) {
    const kind = fields[key];
    if (kind === undefined || !matchesKind(value, kind)) {
      return false;
    }
  }
  return true;
}

function matchesKind(value: unknown, kind: string): boolean {
  if (kind === "integer") {
    return Number.isInteger(value);
  }
  if (kind === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (kind === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  return typeof value === kind;
}
