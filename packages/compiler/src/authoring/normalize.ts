import { diagnoseAuthoringConflicts } from "./diagnostics.js";
import type { AuthoringDeclarationKind, IAuthoringDeclarationNode, IAuthoringGraph, IAuthoringReference } from "./graph.js";
import { compatibilityProvenance, relativeModulePath } from "./provenance.js";

export interface IAuthoringCaptureSource {
  path: string;
  source: string;
}

export interface INormalizeAuthoringGraphOptions {
  entryPath: string;
  projectRoot: string;
  root: unknown;
  sources: ReadonlyArray<IAuthoringCaptureSource>;
}

interface IBundleRootLike {
  scene?: unknown;
  scenes?: unknown[];
  world?: unknown;
}

export function normalizeAuthoringGraph(options: INormalizeAuthoringGraphOptions): IAuthoringGraph {
  const sourceModules = new Set(options.sources.map((source) => relativeModulePath(options.projectRoot, source.path)));
  sourceModules.add(relativeModulePath(options.projectRoot, options.entryPath));
  const modulePaths = [...sourceModules].sort();
  const sourceNodes = sourceDeclarations(options.sources, options.projectRoot);
  const sourceKeys = new Set(sourceNodes.map(declarationKey));
  const rootNodes = rootDeclarations(options.root, options.projectRoot, options.entryPath).filter((declaration) => !sourceKeys.has(declarationKey(declaration)));
  const declarations = [projectDeclaration(options), ...rootNodes, ...sourceNodes];
  const sortedDeclarations = stableDeclarations(dedupeSameDeclaration(declarations));
  const modules = modulePaths.map((path) => ({
    declarations: sortedDeclarations
      .filter((declaration) => declaration.provenance.source.modulePath === path)
      .map((declaration) => declaration.provenance.declarationId)
      .sort(),
    path,
  }));
  const diagnostics = diagnoseAuthoringConflicts(declarations);

  return {
    declarations: sortedDeclarations,
    diagnostics,
    entryPath: relativeModulePath(options.projectRoot, options.entryPath),
    modules,
    projectRoot: options.projectRoot,
    schema: "threenative.authoring-graph",
    version: "0.1.0",
  };
}

function projectDeclaration(options: INormalizeAuthoringGraphOptions): IAuthoringDeclarationNode {
  const id = "project";
  return {
    id,
    kind: "project",
    provenance: compatibilityProvenance(options.projectRoot, options.entryPath, "project", id),
    references: [],
  };
}

function rootDeclarations(root: unknown, projectRoot: string, entryPath: string): IAuthoringDeclarationNode[] {
  const declarations: IAuthoringDeclarationNode[] = [];
  const bundleRoot = normalizeBundleRoot(root);
  addSceneDeclarations(declarations, bundleRoot, projectRoot, entryPath);
  addWorldDeclarations(declarations, bundleRoot.world, projectRoot, entryPath);
  for (const scene of bundleRoot.scenes ?? []) {
    addWorldDeclarations(declarations, readRecord(scene).world, projectRoot, entryPath, readString(readRecord(scene).id));
  }
  return declarations;
}

function addSceneDeclarations(declarations: IAuthoringDeclarationNode[], bundleRoot: IBundleRootLike, projectRoot: string, entryPath: string): void {
  if (bundleRoot.scene !== undefined) {
    const id = readString(readRecord(bundleRoot.scene).id) ?? "scene";
    declarations.push(declaration(projectRoot, entryPath, "scene", id));
  }
  for (const scene of bundleRoot.scenes ?? []) {
    const record = readRecord(scene);
    const id = readString(record.id);
    if (id !== undefined) {
      declarations.push(declaration(projectRoot, entryPath, "scene", id));
    }
  }
}

function addWorldDeclarations(declarations: IAuthoringDeclarationNode[], world: unknown, projectRoot: string, entryPath: string, ownerScene?: string): void {
  if (!isWorldLike(world)) {
    return;
  }
  const snapshot = world.toJSON();
  for (const entity of snapshot.entities ?? []) {
    declarations.push(declaration(projectRoot, entryPath, "entity", entity.id, ownerScene));
    for (const component of Object.keys(entity.components ?? {})) {
      declarations[declarations.length - 1]?.references.push({ kind: "component", targetId: component });
    }
  }
  for (const resource of Object.keys(snapshot.resources ?? {})) {
    declarations.push(declaration(projectRoot, entryPath, "resource", resource, ownerScene));
  }
  for (const system of snapshot.systems ?? []) {
    declarations.push(declaration(projectRoot, entryPath, "system", system.name, ownerScene, systemReferences(system)));
  }
}

function sourceDeclarations(sources: ReadonlyArray<IAuthoringCaptureSource>, projectRoot: string): IAuthoringDeclarationNode[] {
  return sources.flatMap((source) => {
    const modulePath = relativeModulePath(projectRoot, source.path);
    const declarations: IAuthoringDeclarationNode[] = [];
    for (const match of source.source.matchAll(/\bnew\s+Scene\s*\(\s*\{[^}]*\bid\s*:\s*["']([^"']+)["']/g)) {
      const id = match[1];
      if (id !== undefined) {
        declarations.push(sourceDeclaration(modulePath, "scene", id, match.index));
      }
    }
    for (const match of source.source.matchAll(/\bdefineScene\s*\(\s*\{[^}]*\bid\s*:\s*["']([^"']+)["']/g)) {
      const id = match[1];
      if (id !== undefined) {
        declarations.push(sourceDeclaration(modulePath, "scene", id, match.index));
      }
    }
    for (const match of source.source.matchAll(/\bdefineSceneModule\s*\(\s*\{[^}]*\bid\s*:\s*["']([^"']+)["']/g)) {
      const id = match[1];
      if (id !== undefined) {
        declarations.push(sourceDeclaration(modulePath, "scene", id, match.index));
      }
    }
    for (const match of source.source.matchAll(/\bdefineEntity\s*\(\s*\{[^}]*\bid\s*:\s*["']([^"']+)["']/g)) {
      const id = match[1];
      if (id !== undefined) {
        declarations.push(sourceDeclaration(modulePath, "entity", id, match.index));
      }
    }
    for (const match of source.source.matchAll(/\bdefinePrefabModule\s*\(\s*\{[^}]*\bid\s*:\s*["']([^"']+)["']/g)) {
      const id = match[1];
      if (id !== undefined) {
        declarations.push(sourceDeclaration(modulePath, "prefab", id, match.index));
      }
    }
    for (const match of source.source.matchAll(/\bdefineResourceModule\s*\(\s*\{[^}]*\bid\s*:\s*["']([^"']+)["']/g)) {
      const id = match[1];
      if (id !== undefined) {
        declarations.push(sourceDeclaration(modulePath, "resource", id, match.index));
      }
    }
    return declarations;
  });
}

function declaration(
  projectRoot: string,
  entryPath: string,
  kind: AuthoringDeclarationKind,
  id: string,
  ownerScene?: string,
  references: IAuthoringReference[] = [],
): IAuthoringDeclarationNode {
  return {
    id,
    kind,
    ...(ownerScene === undefined ? {} : { ownerScene }),
    provenance: compatibilityProvenance(projectRoot, entryPath, kind, id, ownerScene),
    references,
  };
}

function sourceDeclaration(modulePath: string, kind: AuthoringDeclarationKind, id: string, start?: number): IAuthoringDeclarationNode {
  return {
    id,
    kind,
    provenance: {
      declarationId: id,
      kind,
      source: {
        modulePath,
        ...(start === undefined ? {} : { span: { end: start, start } }),
      },
    },
    references: [],
  };
}

function systemReferences(system: IWorldLikeSystem): IAuthoringReference[] {
  return [
    ...system.reads.map((targetId) => ({ kind: "component-read", targetId })),
    ...system.writes.map((targetId) => ({ kind: "component-write", targetId })),
    ...system.resourceReads.map((targetId) => ({ kind: "resource-read", targetId })),
    ...system.resourceWrites.map((targetId) => ({ kind: "resource-write", targetId })),
    ...system.eventReads.map((targetId) => ({ kind: "event-read", targetId })),
    ...system.eventWrites.map((targetId) => ({ kind: "event-write", targetId })),
  ].sort((left, right) => left.kind.localeCompare(right.kind) || left.targetId.localeCompare(right.targetId));
}

function stableDeclarations(declarations: readonly IAuthoringDeclarationNode[]): IAuthoringDeclarationNode[] {
  return [...declarations].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id) ||
      (left.ownerScene ?? "").localeCompare(right.ownerScene ?? "") ||
      left.provenance.source.modulePath.localeCompare(right.provenance.source.modulePath),
  );
}

function dedupeSameDeclaration(declarations: readonly IAuthoringDeclarationNode[]): IAuthoringDeclarationNode[] {
  return [
    ...new Map(
      declarations.map((declaration) => [
        `${declaration.kind}:${declaration.id}:${declaration.ownerScene ?? ""}:${declaration.provenance.source.modulePath}`,
        declaration,
      ]),
    ).values(),
  ];
}

function declarationKey(declaration: IAuthoringDeclarationNode): string {
  return `${declaration.kind}:${declaration.id}`;
}

function normalizeBundleRoot(root: unknown): IBundleRootLike {
  if (isRecord(root) && ("scene" in root || "world" in root || "scenes" in root)) {
    return {
      scene: root.scene,
      scenes: Array.isArray(root.scenes) ? root.scenes : undefined,
      world: root.world,
    };
  }
  return { scene: root };
}

interface IWorldLikeSystem {
  eventReads: string[];
  eventWrites: string[];
  name: string;
  reads: string[];
  resourceReads: string[];
  resourceWrites: string[];
  writes: string[];
}

interface IWorldLikeSnapshot {
  entities?: Array<{ components?: Record<string, unknown>; id: string }>;
  resources?: Record<string, unknown>;
  systems?: IWorldLikeSystem[];
}

interface IWorldLike {
  constructor: { name: string };
  toJSON(): IWorldLikeSnapshot;
}

function isWorldLike(value: unknown): value is IWorldLike {
  return isRecord(value) && typeof value.toJSON === "function" && value.constructor.name === "World";
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
