import type { IFractureManifest, IWorldEntity, IWorldIr } from "@threenative/ir";
import { disposePhysicsRuntime, observePhysicsContactImpulses, syncPhysicsDestructionBodies } from "./physics.js";

export type { IFractureManifest } from "@threenative/ir";

export type IPhysicsDestructionCleanup = NonNullable<IFractureManifest["cleanup"]>;

type IIrDestructibleComponent = NonNullable<IWorldEntity["components"]["Destructible"]>;

export interface IPhysicsDestructibleComponent extends IIrDestructibleComponent {
  entity: string;
}

export interface IPhysicsDestructionCause {
  contact?: string;
  entity?: string;
  kind: "contact" | "script";
}

export interface IPhysicsDestructionDamage {
  amount?: number;
  assembly: string;
  bond: string;
  cause: IPhysicsDestructionCause;
  energy?: number;
  impulse?: number;
  layer?: string;
  tick: number;
}

type DestructionEvent =
  | { amount: number; assembly: string; bond: string; cause: IPhysicsDestructionCause; remainingHealth: number; tick: number; type: "damaged" }
  | { assembly: string; bond: string; cause: IPhysicsDestructionCause; tick: number; type: "bondBroken" }
  | { assembly: string; cause: IPhysicsDestructionCause; piece: string; tick: number; type: "pieceActivated" }
  | { assembly: string; cause: IPhysicsDestructionCause; tick: number; type: "assemblyBroken" }
  | { assembly: string; cause: IPhysicsDestructionCause; piece: string; policy: IFractureManifest["budgets"]["overflowPolicy"]; tick: number; type: "budgetExceeded" };

interface IBondState {
  broken: boolean;
  health: number;
  source: IFractureManifest["bonds"][number];
}

type PieceLifecycle = "active" | "bound" | "despawned" | "pooled" | "sleeping";
interface IPieceState {
  activeAge: number;
  activatedAt?: number;
  lifecycle: PieceLifecycle;
  source: IFractureManifest["pieces"][number];
}

interface IAssemblyState {
  assemblyBroken: boolean;
  bonds: Map<string, IBondState>;
  component: IPhysicsDestructibleComponent;
  manifest: IFractureManifest;
  pieces: Map<string, IPieceState>;
  sourceSignature: string;
}

export interface IPhysicsDestructionRuntime {
  assemblies: Map<string, IAssemblyState>;
  lastProcessedTick: number;
  maxActivePieces: number;
  pending: Map<number, IPhysicsDestructionDamage[]>;
}

export function createPhysicsDestructionRuntime(options: { maxActivePieces?: number } = {}): IPhysicsDestructionRuntime {
  return { assemblies: new Map(), lastProcessedTick: -1, maxActivePieces: options.maxActivePieces ?? 1024, pending: new Map() };
}

export function registerPhysicsDestructible(runtime: IPhysicsDestructionRuntime, component: IPhysicsDestructibleComponent, manifest: IFractureManifest): void {
  if (!manifestReferenceMatches(component.fractureManifest, manifest.id)) throw new Error(`Destructible '${component.entity}' references '${component.fractureManifest}', not manifest '${manifest.id}'.`);
  const strength = component.bondStrength ?? 1;
  runtime.assemblies.set(component.entity, {
    assemblyBroken: false,
    bonds: new Map(manifest.bonds.map((bond) => [bond.id, { broken: false, health: bond.health * strength, source: bond }])),
    component,
    manifest,
    pieces: new Map(manifest.pieces.map((piece) => [piece.id, { activeAge: 0, lifecycle: "bound", source: piece }])),
    sourceSignature: destructionSourceSignature(component, manifest),
  });
}

export function reconcilePhysicsDestructibles(runtime: IPhysicsDestructionRuntime, world: IWorldIr, manifests: Readonly<Record<string, IFractureManifest>>): void {
  const desired = new Map(world.entities.flatMap((entity) => {
    const component = entity.components.Destructible;
    if (component === undefined) return [];
    const manifest = manifests[component.fractureManifest];
    if (manifest === undefined) throw new Error(`Destructible '${entity.id}' references unloaded fracture manifest '${component.fractureManifest}'.`);
    return [[entity.id, { component: { ...component, entity: entity.id }, manifest }] as const];
  }));
  let invalidatedPhysics = false;
  for (const [entity, current] of runtime.assemblies) {
    const next = desired.get(entity);
    if (next !== undefined && current.sourceSignature === destructionSourceSignature(next.component, next.manifest)) continue;
    unregisterPhysicsDestructible(runtime, entity);
    invalidatedPhysics = true;
  }
  if (invalidatedPhysics) disposePhysicsRuntime(world);
  for (const [entity, next] of desired) {
    if (runtime.assemblies.has(entity)) continue;
    registerPhysicsDestructible(runtime, next.component, next.manifest);
  }
}

export function unregisterPhysicsDestructible(runtime: IPhysicsDestructionRuntime, entity: string): void {
  runtime.assemblies.delete(entity);
  for (const [tick, queued] of runtime.pending) runtime.pending.set(tick, queued.filter((damage) => damage.assembly !== entity));
}

export function queuePhysicsDestructionDamage(runtime: IPhysicsDestructionRuntime, damage: IPhysicsDestructionDamage): boolean {
  if (damage.tick <= runtime.lastProcessedTick || !runtime.assemblies.has(damage.assembly)) return false;
  const queued = runtime.pending.get(damage.tick) ?? [];
  queued.push(structuredClone(damage));
  runtime.pending.set(damage.tick, queued);
  return true;
}

export function stepPhysicsDestruction(runtime: IPhysicsDestructionRuntime, world: IWorldIr, tick: number, delta: number): DestructionEvent[] {
  if (tick <= runtime.lastProcessedTick) {
    writeEvents(world, []);
    return [];
  }
  queueRetainedContactDamage(runtime, world, tick);
  runtime.lastProcessedTick = tick;
  for (const queuedTick of runtime.pending.keys()) if (queuedTick < tick) runtime.pending.delete(queuedTick);
  cleanupPieces(runtime, Math.max(0, delta));
  const events: DestructionEvent[] = [];
  const grouped = groupDamage(runtime, runtime.pending.get(tick) ?? []);
  runtime.pending.delete(tick);
  for (const group of grouped) applyDamageGroup(runtime, group, tick, events);
  for (const assembly of [...runtime.assemblies.values()].sort((left, right) => left.component.entity.localeCompare(right.component.entity))) {
    syncPhysicsDestructionBodies(
      world,
      assembly.component.entity,
      [...assembly.pieces.values()].map((piece) => ({ lifecycle: piece.lifecycle, piece: piece.source })),
    );
  }
  writeEvents(world, events);
  return events;
}

function queueRetainedContactDamage(runtime: IPhysicsDestructionRuntime, world: IWorldIr, tick: number): void {
  for (const contact of observePhysicsContactImpulses(world)) {
    for (const entity of [contact.a, contact.b]) {
      const assemblyId = [...runtime.assemblies.keys()].find((id) => entity === id || entity.startsWith(`${id}/`));
      if (assemblyId === undefined) continue;
      const other = entity === contact.a ? contact.b : contact.a;
      const assembly = runtime.assemblies.get(assemblyId);
      if (assembly === undefined) continue;
      const bond = contactBond(assembly, world, contact.point);
      if (bond === undefined) continue;
      const contactId = `rapier:${contact.a}:${contact.b}`;
      const alreadyQueued = (runtime.pending.get(tick) ?? []).some((damage) => damage.assembly === assemblyId && damage.bond === bond && damage.cause.kind === "contact" && damage.cause.contact === contactId);
      if (alreadyQueued) continue;
      const layer = world.entities.find((candidate) => candidate.id === other)?.components.Collider?.layer;
      queuePhysicsDestructionDamage(runtime, { assembly: assemblyId, bond, cause: { contact: contactId, entity: other, kind: "contact" }, impulse: contact.impulse, ...(layer === undefined ? {} : { layer }), tick });
    }
  }
}

function contactBond(assembly: IAssemblyState, world: IWorldIr, point: readonly number[] | undefined): string | undefined {
  const healthy = [...assembly.bonds.values()].filter((bond) => !bond.broken).sort((left, right) => left.source.id.localeCompare(right.source.id));
  if (healthy.length === 0) return undefined;
  if (point === undefined) return healthy[0]?.source.id;
  const origin = world.entities.find((entity) => entity.id === assembly.component.entity)?.components.Transform?.position ?? [0, 0, 0];
  const nearestPiece = [...assembly.pieces.values()].sort((left, right) => {
    const leftDistance = squaredDistance(point, addPosition(origin, left.source.localPosition));
    const rightDistance = squaredDistance(point, addPosition(origin, right.source.localPosition));
    return leftDistance - rightDistance || left.source.id.localeCompare(right.source.id);
  })[0]?.source.id;
  return healthy.find((bond) => nearestPiece !== undefined && bond.source.pieces.includes(nearestPiece))?.source.id ?? healthy[0]?.source.id;
}

function addPosition(left: readonly number[], right: readonly number[]): readonly number[] { return [(left[0] ?? 0) + (right[0] ?? 0), (left[1] ?? 0) + (right[1] ?? 0), (left[2] ?? 0) + (right[2] ?? 0)]; }
function squaredDistance(left: readonly number[], right: readonly number[]): number { return ((left[0] ?? 0) - (right[0] ?? 0)) ** 2 + ((left[1] ?? 0) - (right[1] ?? 0)) ** 2 + ((left[2] ?? 0) - (right[2] ?? 0)) ** 2; }
function destructionSourceSignature(component: IPhysicsDestructibleComponent, manifest: IFractureManifest): string { return JSON.stringify([component, manifest]); }
function effectiveAssemblyBudget(runtime: IPhysicsDestructionRuntime, assembly: IAssemblyState): number { return Math.min(runtime.maxActivePieces, assembly.manifest.budgets.maxActivePieces, assembly.component.activationBudget ?? Number.POSITIVE_INFINITY); }

export function observePhysicsDestruction(runtime: IPhysicsDestructionRuntime): {
  assemblies: Array<{ broken: boolean; id: string }>;
  bonds: Array<{ assembly: string; broken: boolean; health: number; id: string; pieces: readonly [string, string] }>;
  budgets: Array<{ activePieces: number; assembly: string; maximumActivePieces: number; policy: IFractureManifest["budgets"]["overflowPolicy"] }>;
  pieces: Array<{ activationDepth: number; assembly: string; collider: IFractureManifest["pieces"][number]["collider"]; id: string; lifecycle: PieceLifecycle }>;
} {
  return {
    assemblies: [...runtime.assemblies].map(([id, assembly]) => ({ broken: assembly.assemblyBroken, id })).sort((left, right) => left.id.localeCompare(right.id)),
    bonds: [...runtime.assemblies].flatMap(([assembly, state]) => [...state.bonds].map(([id, bond]) => ({ assembly, broken: bond.broken, health: round(bond.health), id, pieces: bond.source.pieces }))).sort(compareOwned),
    budgets: [...runtime.assemblies].map(([assembly, state]) => ({ activePieces: [...state.pieces.values()].filter((piece) => piece.lifecycle === "active" || piece.lifecycle === "sleeping").length, assembly, maximumActivePieces: effectiveAssemblyBudget(runtime, state), policy: state.manifest.budgets.overflowPolicy })).sort((left, right) => left.assembly.localeCompare(right.assembly)),
    pieces: [...runtime.assemblies].flatMap(([assembly, state]) => [...state.pieces].map(([id, piece]) => ({ activationDepth: piece.source.activationDepth, assembly, collider: piece.source.collider, id, lifecycle: piece.lifecycle }))).sort(compareOwned),
  };
}

function groupDamage(runtime: IPhysicsDestructionRuntime, input: readonly IPhysicsDestructionDamage[]): Array<{ assembly: string; bond: string; cause: IPhysicsDestructionCause; damage: number }> {
  const groups = new Map<string, { assembly: string; bond: string; cause: IPhysicsDestructionCause; damage: number }>();
  for (const item of [...input].sort(compareDamage)) {
    const key = `${item.assembly}\u0000${item.bond}`;
    const current = groups.get(key) ?? { assembly: item.assembly, bond: item.bond, cause: item.cause, damage: 0 };
    const assembly = runtime.assemblies.get(item.assembly);
    const bond = assembly?.bonds.get(item.bond);
    if (assembly === undefined || bond === undefined || !impactAllowed(assembly.component, item)) continue;
    current.damage += damageAmount(item, bond);
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => left.assembly.localeCompare(right.assembly) || left.bond.localeCompare(right.bond));
}

function applyDamageGroup(runtime: IPhysicsDestructionRuntime, group: { assembly: string; bond: string; cause: IPhysicsDestructionCause; damage: number }, tick: number, events: DestructionEvent[]): void {
  const assembly = runtime.assemblies.get(group.assembly);
  const bond = assembly?.bonds.get(group.bond);
  if (assembly === undefined || bond === undefined || bond.broken || group.damage <= 0) return;
  const amount = Math.min(bond.health, group.damage * materialDamageMultiplier(bond.source.materialResponse));
  bond.health = Math.max(0, bond.health - amount);
  events.push({ amount: round(amount), assembly: group.assembly, bond: group.bond, cause: group.cause, remainingHealth: round(bond.health), tick, type: "damaged" });
  if (bond.health > 0) return;
  bond.broken = true;
  events.push({ assembly: group.assembly, bond: group.bond, cause: group.cause, tick, type: "bondBroken" });
  const candidates = bond.source.pieces.map((id) => assembly.pieces.get(id)).filter((piece): piece is IPieceState => piece !== undefined).sort((left, right) => left.source.activationDepth - right.source.activationDepth || left.source.id.localeCompare(right.source.id));
  for (const piece of candidates) activatePiece(runtime, assembly, piece, group.cause, tick, events);
  if (!assembly.assemblyBroken && [...assembly.bonds.values()].every((item) => item.broken)) {
    assembly.assemblyBroken = true;
    events.push({ assembly: group.assembly, cause: group.cause, tick, type: "assemblyBroken" });
  }
}

function activatePiece(runtime: IPhysicsDestructionRuntime, assembly: IAssemblyState, piece: IPieceState, cause: IPhysicsDestructionCause, tick: number, events: DestructionEvent[]): void {
  if (piece.lifecycle === "active") return;
  const maxDepth = Math.min(assembly.manifest.budgets.maxDepth, assembly.component.maxDepth ?? Number.POSITIVE_INFINITY);
  const assemblyBudget = Math.min(assembly.manifest.budgets.maxActivePieces, assembly.component.activationBudget ?? Number.POSITIVE_INFINITY);
  const assemblyActive = activePieces(assembly).length;
  const sceneActive = [...runtime.assemblies.values()].reduce((sum, item) => sum + activePieces(item).length, 0);
  const depthExceeded = piece.source.activationDepth > maxDepth;
  const assemblyExceeded = assemblyActive >= assemblyBudget;
  const sceneExceeded = sceneActive >= runtime.maxActivePieces;
  if (depthExceeded || assemblyExceeded || sceneExceeded) {
    const policy = assembly.manifest.budgets.overflowPolicy;
    events.push({ assembly: assembly.component.entity, cause, piece: piece.source.id, policy, tick, type: "budgetExceeded" });
    if (depthExceeded || policy === "reject-new") return;
    const candidates = assemblyExceeded ? activePieces(assembly) : [...runtime.assemblies.values()].flatMap((item) => activePieces(item));
    const oldest = candidates.sort((left, right) => (left.activatedAt ?? 0) - (right.activatedAt ?? 0) || left.source.id.localeCompare(right.source.id))[0];
    if (oldest === undefined) return;
    oldest.lifecycle = policy === "sleep-oldest" ? "sleeping" : "despawned";
  }
  piece.lifecycle = "active";
  piece.activatedAt = tick;
  piece.activeAge = 0;
  events.push({ assembly: assembly.component.entity, cause, piece: piece.source.id, tick, type: "pieceActivated" });
}

function cleanupPieces(runtime: IPhysicsDestructionRuntime, delta: number): void {
  for (const assembly of runtime.assemblies.values()) {
    const timings = assembly.manifest.cleanup;
    const policy = assembly.component.cleanupPolicy ?? ((timings?.poolCapacity ?? 0) > 0 ? "pool" : timings?.despawnAfterSeconds !== undefined ? "despawn" : "sleep");
    for (const piece of assembly.pieces.values()) {
      if (piece.lifecycle !== "active" && piece.lifecycle !== "sleeping") continue;
      piece.activeAge += delta;
      if (policy === "sleep" && piece.lifecycle === "active" && timings?.sleepAfterSeconds !== undefined && piece.activeAge >= timings.sleepAfterSeconds) piece.lifecycle = "sleeping";
      if ((policy === "despawn" || policy === "pool") && timings?.despawnAfterSeconds !== undefined && piece.activeAge >= timings.despawnAfterSeconds) {
        const pooled = [...assembly.pieces.values()].filter((candidate) => candidate.lifecycle === "pooled").length;
        piece.lifecycle = policy === "pool" && pooled < (timings.poolCapacity ?? 0) ? "pooled" : "despawned";
      }
    }
  }
}

function activePieces(assembly: IAssemblyState): IPieceState[] { return [...assembly.pieces.values()].filter((piece) => piece.lifecycle === "active"); }
function materialDamageMultiplier(value: number | undefined): number { return value ?? 1; }
function damageAmount(input: IPhysicsDestructionDamage, bond: IBondState): number {
  if (input.amount !== undefined) return Math.max(0, input.amount);
  const impulseRatio = bond.source.impulseThreshold <= 0 ? 0 : Math.max(0, input.impulse ?? 0) / bond.source.impulseThreshold;
  const energyRatio = bond.source.energyThreshold === undefined || bond.source.energyThreshold <= 0 ? 0 : Math.max(0, input.energy ?? 0) / bond.source.energyThreshold;
  return bond.source.health * Math.max(impulseRatio, energyRatio);
}
function impactAllowed(component: IPhysicsDestructibleComponent, input: IPhysicsDestructionDamage): boolean {
  if (input.cause.kind !== "contact") return true;
  if ((input.impulse ?? 0) < (component.impactFilter?.minImpulse ?? 0)) return false;
  const layers = component.impactFilter?.layers;
  return layers === undefined || (input.layer !== undefined && layers.includes(input.layer));
}
function compareDamage(left: IPhysicsDestructionDamage, right: IPhysicsDestructionDamage): number { return left.assembly.localeCompare(right.assembly) || left.bond.localeCompare(right.bond) || JSON.stringify(left.cause).localeCompare(JSON.stringify(right.cause)); }
function compareOwned(left: { assembly: string; id: string }, right: { assembly: string; id: string }): number { return left.assembly.localeCompare(right.assembly) || left.id.localeCompare(right.id); }
function manifestReferenceMatches(reference: string, id: string): boolean {
  if (reference === id) return true;
  const basename = reference.split("/").at(-1) ?? reference;
  return basename.endsWith(".json") && basename.slice(0, -5) === id;
}
function round(value: number): number { return Number(value.toFixed(6)); }
function writeEvents(world: IWorldIr, events: readonly DestructionEvent[]): void { world.events ??= {}; world.events.DestructionEvent = events; }

export type IPhysicsDestructionEvent = DestructionEvent;
