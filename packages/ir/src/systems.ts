import type { SchemaVersion } from "./types.js";

export type IrSystemSchedule = "fixedUpdate" | "postUpdate" | "startup" | "update";
export type IrSystemService = "animation.play" | "physics.overlap" | "physics.raycast" | "physics.shapeCast";

export type IrSystemCommand =
  | {
      kind: "addComponent" | "removeComponent" | "setComponent";
      component: string;
      entity: string;
    }
  | {
      components: string[];
      entity: string;
      kind: "spawn";
    }
  | {
      entity: string;
      kind: "despawn";
    }
  | {
      event: string;
      kind: "emitEvent";
    };

export interface IIrSystemQuery {
  with: string[];
  without: string[];
}

export interface IIrSystemDeclaration {
  commands: IrSystemCommand[];
  eventReads: string[];
  eventWrites: string[];
  name: string;
  queries: IIrSystemQuery[];
  reads: string[];
  resourceReads: string[];
  resourceWrites: string[];
  services: IrSystemService[];
  script?: {
    bundle: "scripts.bundle.js";
    exportName: string;
  };
  schedule: IrSystemSchedule;
  writes: string[];
}

export interface ISystemsIr {
  lifecycle?: {
    hotReload: "invalidate";
    replay: "fixed-trace";
    state: "system-local-disallowed";
  };
  schema: "threenative.systems";
  version: SchemaVersion;
  systems: IIrSystemDeclaration[];
}
