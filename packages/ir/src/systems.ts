import type { SchemaVersion } from "./types.js";

export type IrSystemSchedule = "fixedUpdate" | "postUpdate" | "startup" | "update";
export type IrSystemService =
  | "animation.play"
  | "animation.query"
  | "animation.stop"
  | "audio.play"
  | "audio.query"
  | "audio.stop"
  | "assets.load"
  | "character.move"
  | "physics.overlap"
  | "physics.raycast"
  | "physics.sensor"
  | "physics.shapeCast"
  | "navigation.path"
  | "particles.burst"
  | "particles.reset"
  | "particles.start"
  | "particles.stop"
  | "picking.mesh"
  | "picking.pointerRay"
  | "persistence.delete"
  | "persistence.listSlots"
  | "persistence.load"
  | "persistence.save"
  | "scene.change"
  | "scene.current"
  | "scene.loadAdditive"
  | "scene.pop"
  | "scene.push"
  | "scene.unload"
  | "sequences.play"
  | "sequences.query"
  | "sequences.stop"
  | "settings.export"
  | "settings.get"
  | "settings.import"
  | "settings.set"
  | "ui.actions"
  | "ui.activate"
  | "ui.focus"
  | "ui.read"
  | "ui.setDisabled"
  | "ui.setValue";

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
      kind: "instantiate";
      prefab: string;
      prefix: string;
    }
  | {
      child: string;
      kind: "setParent";
      parent: string;
    }
  | {
      child: string;
      kind: "clearParent";
    }
  | {
      event: string;
      kind: "emitEvent";
    };

export interface IIrSystemQuery {
  changed?: string[];
  limit?: number;
  offset?: number;
  orderBy?: "id";
  with: string[];
  without: string[];
}

export interface IIrSystemDeclaration {
  after?: string[];
  before?: string[];
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
  source?: "behavior-metadata";
  writes: string[];
}

export interface IIrScriptAudioDeclaration {
  id: string;
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
  scriptAudio?: IIrScriptAudioDeclaration[];
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
