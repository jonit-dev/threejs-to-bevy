import type { SchemaVersion } from "./types.js";

export type IrSystemSchedule = "fixedUpdate" | "postUpdate" | "update";

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
  schedule: IrSystemSchedule;
  writes: string[];
}

export interface ISystemsIr {
  schema: "threenative.systems";
  version: SchemaVersion;
  systems: IIrSystemDeclaration[];
}
