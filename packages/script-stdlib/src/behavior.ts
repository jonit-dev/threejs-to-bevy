import type { ScriptContext } from "./script-context.js";

export type BehaviorSchedule = "fixedUpdate" | "postUpdate" | "startup" | "update";

export interface IBehaviorQueryMetadata {
  changed?: readonly string[];
  limit?: number;
  offset?: number;
  orderBy?: "id";
  with?: readonly string[];
  without?: readonly string[];
}

export interface IBehaviorCommandMetadata {
  child?: string;
  component?: string;
  components?: readonly string[];
  entity?: string;
  event?: string;
  kind: string;
  parent?: string;
  prefab?: string;
  prefix?: string;
}

export interface IBehaviorMetadata {
  after?: readonly string[];
  before?: readonly string[];
  commands?: readonly IBehaviorCommandMetadata[];
  eventReads?: readonly string[];
  eventWrites?: readonly string[];
  id?: string;
  queries?: readonly IBehaviorQueryMetadata[];
  reads?: readonly string[];
  resourceReads?: readonly string[];
  resourceWrites?: readonly string[];
  schedule?: BehaviorSchedule;
  services?: readonly string[];
  writes?: readonly string[];
}

export type BehaviorFunction<TContext extends ScriptContext = ScriptContext> = (context: TContext) => void;

export type IBehaviorFunction<TContext extends ScriptContext = ScriptContext> = BehaviorFunction<TContext> & {
  readonly __tnBehavior: IBehaviorMetadata;
};

export function defineBehavior<TContext extends ScriptContext, TBehavior extends BehaviorFunction<TContext>>(
  metadata: IBehaviorMetadata,
  behavior: TBehavior,
): TBehavior & IBehaviorFunction<TContext> {
  Object.defineProperty(behavior, "__tnBehavior", {
    configurable: false,
    enumerable: false,
    value: Object.freeze(cloneBehaviorMetadata(metadata)),
    writable: false,
  });
  return behavior as TBehavior & IBehaviorFunction<TContext>;
}

function cloneBehaviorMetadata(metadata: IBehaviorMetadata): IBehaviorMetadata {
  return JSON.parse(JSON.stringify(metadata)) as IBehaviorMetadata;
}
