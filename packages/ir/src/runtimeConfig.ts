import type { SchemaVersion } from "./types.js";

export interface IRuntimeConfigIr {
  schema: "threenative.runtime-config";
  version: SchemaVersion;
  time: {
    fixedDelta: number;
    paused: boolean;
  };
  window: {
    height: number;
    title?: string;
    width: number;
  };
}
