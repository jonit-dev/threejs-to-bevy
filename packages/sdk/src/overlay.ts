import { SdkError } from "./errors.js";

export type OverlayInputMode = "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard";
export type OverlayTargetProfile = "desktop" | "web";
export type OverlayMessageSchemaKind = "boolean" | "integer" | "number" | "object" | "string";

export interface IOverlayMessageSchema {
  fields?: Record<string, OverlayMessageSchemaKind>;
  kind: "object";
  required?: string[];
}

export interface IOverlayMessageDeclaration {
  name: string;
  schema: IOverlayMessageSchema;
}

export interface IOverlayMountOptions {
  assets?: readonly string[];
  entry: string;
  id: string;
  input?: OverlayInputMode;
  layout?: IOverlayLayout;
  messages?: {
    gameToOverlay?: readonly IOverlayMessageDeclaration[];
    overlayToGame?: readonly IOverlayMessageDeclaration[];
  };
  targetProfiles?: readonly OverlayTargetProfile[];
  transparent?: boolean;
  zIndex?: number;
}

export interface IOverlayLayoutRect { height: number; width: number; x: number; y: number }
export interface IOverlayViewportLayout { mode: "viewport" }
export type IOverlayLayout = IOverlayLayoutRect | IOverlayViewportLayout;

export interface IOverlayDeclaration {
  assets: readonly string[];
  entry: string;
  id: string;
  input: OverlayInputMode;
  layout?: IOverlayLayout;
  messages: {
    gameToOverlay: readonly IOverlayMessageDeclaration[];
    overlayToGame: readonly IOverlayMessageDeclaration[];
  };
  targetProfiles: readonly OverlayTargetProfile[];
  transparent: boolean;
  zIndex: number;
}

export const overlay = {
  mount(options: IOverlayMountOptions): IOverlayDeclaration {
    if (options.id.trim() === "") {
      throw new SdkError("TN_SDK_OVERLAY_ID_INVALID", "overlay.mount requires a non-empty overlay id.");
    }
    if (options.entry.trim() === "") {
      throw new SdkError("TN_SDK_OVERLAY_ENTRY_INVALID", "overlay.mount requires a bundle-local entry path.");
    }
    return {
      assets: [...new Set([options.entry, ...(options.assets ?? [])])].sort((left, right) => left.localeCompare(right)),
      entry: options.entry,
      id: options.id,
      input: options.input ?? "none",
      ...(options.layout === undefined ? {} : { layout: { ...options.layout } }),
      messages: {
        gameToOverlay: [...(options.messages?.gameToOverlay ?? [])],
        overlayToGame: [...(options.messages?.overlayToGame ?? [])],
      },
      targetProfiles: [...(options.targetProfiles ?? ["web", "desktop"])],
      transparent: options.transparent ?? true,
      zIndex: options.zIndex ?? 10,
    };
  },
};
