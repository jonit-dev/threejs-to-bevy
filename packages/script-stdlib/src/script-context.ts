export type ScriptVec3Tuple = [number, number, number];
export type ScriptQuatTuple = [number, number, number, number];

export interface ScriptEntity {
  readonly components?: Record<string, unknown>;
  readonly id: string;
  get<T = unknown>(component: unknown): T;
  get<T extends Record<string, unknown>>(component: unknown, defaults: T): T;
  has(component: unknown): boolean;
  patch(component: unknown, value: Record<string, unknown>): void;
  set(component: unknown, value: unknown): void;
  transform(): ScriptTransformFacade;
}

export interface ScriptTransformFacade {
  position: ScriptVec3Tuple;
  positionOr(fallback: readonly [number, number, number]): ScriptVec3Tuple;
  setPose(position: readonly [number, number, number], rotation: readonly [number, number, number, number]): void;
  setPosition(position: readonly [number, number, number]): void;
  setRotation(rotation: readonly [number, number, number, number]): void;
  yawOr(fallback: number): number;
}

export interface ScriptContext {
  commands: {
    addComponent(entity: string, component: Record<string, unknown>): void;
    clearParent(child: string): void;
    despawn(entity: string, policy?: string): void;
    emitEvent(event: string, payload?: Record<string, unknown>): void;
    instantiate(prefab: string, prefix: string, overrides?: Record<string, unknown>): void;
    removeComponent(entity: string, component: unknown): void;
    setComponent(entity: string, component: unknown, value: unknown): void;
    setParent(child: string, parent: string): void;
    spawn(entity: string, components?: unknown): void;
  };
  entity(id: string): ScriptEntity | undefined;
  entities: {
    byId<T extends Record<string, string>>(ids: T): { [K in keyof T]: ScriptEntity | undefined };
  };
  events: {
    emit(event: string, payload?: Record<string, unknown>): void;
  };
  input: {
    action(name: string): boolean;
    axis(name: string): number;
    axis1(axis: string, buttons?: { negative?: string; positive?: string }): number;
    getAxis(axis: string): number;
    getAxis2(xAxis: string, yAxis: string, options?: { deadzone?: number; normalize?: boolean }): [number, number];
    getButton(name: string): boolean;
    getButtonDown(name: string): boolean;
    getButtonUp(name: string): boolean;
    pressed(name: string): boolean;
    released(name: string): boolean;
  };
  query(query?: { changed?: unknown[]; limit?: number; offset?: number; orderBy?: string; with?: unknown[]; without?: unknown[] }): ScriptEntity[];
  resources: {
    get<T = unknown>(name: string): T;
    get<T extends Record<string, unknown>>(name: string, defaults: T): T;
    patch(name: string, value: Record<string, unknown>): void;
    set(name: string, value: unknown): void;
  };
  state<T extends Record<string, unknown>>(key: string, defaults: T): T;
  time: {
    delta: number;
    deltaTime: number;
    dt: number;
    elapsed: number;
    fixedDelta: number;
    fixedDeltaTime: number;
    fixedDt: number;
    paused: boolean;
    time: number;
  };
  [surface: string]: unknown;
}
