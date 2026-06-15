import type { SchemaVersion } from "./types.js";

export type IrSystemSchedule = "fixedUpdate" | "postUpdate" | "startup" | "update";
export type IrSystemService = "animation.play" | "physics.overlap" | "physics.raycast" | "physics.shapeCast" | "picking.mesh" | "picking.pointerRay";

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
  channels?: IIrSystemChannelDeclaration[];
  componentHooks?: IIrComponentHookDeclaration[];
  lifecycle?: {
    appStates?: IIrAppStateDeclaration[];
    computedStates?: IIrComputedStateDeclaration[];
    hotReload: "invalidate";
    replay: "fixed-trace";
    state: "system-local-disallowed";
    substates?: IIrSubstateDeclaration[];
  };
  observers?: IIrObserverDeclaration[];
  pluginGroups?: IIrSystemPluginGroupDeclaration[];
  plugins?: IIrSystemPluginDeclaration[];
  schema: "threenative.systems";
  tasks?: IIrSystemTaskDeclaration[];
  version: SchemaVersion;
  systems: IIrSystemDeclaration[];
}

export type IrObserverPhase = "bubble" | "target";

export type IrComponentHookKind = "onAdd" | "onInsert";

export interface IIrComponentHookDeclaration {
  component: string;
  hooks: IrComponentHookKind[];
}

export interface IIrObserverDeclaration {
  event: string;
  phases: IrObserverPhase[];
  propagation: "target-ancestors";
}

export interface IIrSystemChannelDeclaration {
  delivery: "fixed-trace";
  event: string;
  id: string;
}

export interface IIrSystemTaskDeclaration {
  channel?: string;
  id: string;
  mode: "fixed-trace";
  schedule: IrSystemSchedule;
}

export interface IIrSystemPluginDeclaration {
  id: string;
  systems: string[];
}

export interface IIrSystemPluginGroupDeclaration {
  id: string;
  plugins: string[];
}

export interface IIrStateSource {
  field: string;
  resource: string;
}

export interface IIrAppStateDeclaration {
  id: string;
  initial: string;
  source: IIrStateSource;
  values: string[];
}

export interface IIrComputedStateDeclaration {
  fallback: string;
  id: string;
  source: IIrStateSource;
  values: string[];
}

export interface IIrSubstateDeclaration {
  fallback: string;
  id: string;
  parent: string;
  parentValue: string;
  source: IIrStateSource;
  values: string[];
}
