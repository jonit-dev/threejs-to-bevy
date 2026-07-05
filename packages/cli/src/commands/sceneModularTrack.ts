import {
  inspectScene,
  type IAuthoringOperationResult,
} from "@threenative/authoring";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";

import { inspectAsset } from "./asset.js";
import {
  isRecord,
  isVector3,
  round,
  type ModularConnectorDirection,
  type ModularTrackLayout,
  type ModularTrackSize,
  type SceneRecord,
} from "./sceneShared.js";

export function parseModularTrackLayout(raw: string | undefined): { diagnostic?: string; value?: ModularTrackLayout } {
  if (raw === undefined) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { diagnostic: "TN_SCENE_MODULAR_TRACK_LAYOUT_INVALID" };
  }
  if (!Array.isArray(parsed)) {
    return { diagnostic: "TN_SCENE_MODULAR_TRACK_LAYOUT_INVALID" };
  }
  const layout: ModularTrackLayout = [];
  for (const [index, item] of parsed.entries()) {
    if (!isRecord(item) || typeof item.asset !== "string" || !isCenterVector(item.center) || !isCardinalYaw(item.yaw)) {
      return { diagnostic: `TN_SCENE_MODULAR_TRACK_LAYOUT_ENTRY_INVALID:${index}` };
    }
    layout.push({ asset: item.asset, center: item.center, yaw: item.yaw });
  }
  return { value: layout };
}

export function generateOvalModularTrackLayout(options: {
  size: string | undefined;
  straightCount: string | undefined;
}): { diagnostic?: string; size?: ModularTrackSize; straightCount?: number; usage?: string; value?: ModularTrackLayout } {
  const size = parseModularTrackSize(options.size);
  if (size === undefined) {
    return {
      diagnostic: "TN_SCENE_GENERATE_MODULAR_TRACK_SIZE_INVALID",
      usage: "Track --size must be small, medium, or large.",
    };
  }

  const straightCount = options.straightCount === undefined ? straightCountForTrackSize(size) : Number(options.straightCount);
  if (!Number.isInteger(straightCount) || straightCount < 1 || straightCount % 2 === 0) {
    return {
      diagnostic: "TN_SCENE_GENERATE_MODULAR_TRACK_STRAIGHT_COUNT_INVALID",
      usage: "Track --straight-count must be an odd integer greater than or equal to 1.",
    };
  }

  const halfSpan = straightCount + 1;
  const sideLine = halfSpan + 0.5;
  const straightCenters = Array.from({ length: straightCount }, (_, index) => -straightCount + index * 2);
  const layout: ModularTrackLayout = [
    { asset: "roadCornerLarge.glb", center: [-halfSpan, -halfSpan], yaw: 0 },
    ...straightCenters.map((center): ModularTrackLayout[number] => ({ asset: "roadStraightLong.glb", center: [center, -sideLine], yaw: 90 })),
    { asset: "roadCornerLarge.glb", center: [halfSpan, -halfSpan], yaw: 270 },
    ...straightCenters.map((center): ModularTrackLayout[number] => ({ asset: "roadStraightLong.glb", center: [sideLine, center], yaw: 0 })),
    { asset: "roadCornerLarge.glb", center: [halfSpan, halfSpan], yaw: 180 },
    ...[...straightCenters].reverse().map((center): ModularTrackLayout[number] => ({ asset: "roadStraightLong.glb", center: [center, sideLine], yaw: 90 })),
    { asset: "roadCornerLarge.glb", center: [-halfSpan, halfSpan], yaw: 90 },
    ...[...straightCenters].reverse().map((center): ModularTrackLayout[number] => ({ asset: "roadStraightLong.glb", center: [-sideLine, center], yaw: 0 })),
  ];

  return { size, straightCount, value: layout };
}

export async function addModularTrack(options: {
  assetDir: string;
  layout: ModularTrackLayout;
  prefix: string;
  projectPath: string;
  sceneId: string;
}): Promise<IAuthoringOperationResult & { prefix: string; tileCount: number }> {
  const inspectedScene = await inspectScene({ projectPath: options.projectPath, sceneId: options.sceneId });
  if (inspectedScene.scene === undefined) {
    return { ...inspectedScene, prefix: options.prefix, tileCount: 0 };
  }

  const scenePath = resolve(options.projectPath, inspectedScene.scene.file);
  const diagnostics = inspectedScene.diagnostics.filter((diagnostic) => !isGeneratedPrefixDiagnostic(diagnostic, options.prefix));
  let scene: SceneRecord;
  try {
    scene = JSON.parse(await readFile(scenePath, "utf8")) as SceneRecord;
  } catch (error) {
    return {
      changed: false,
      diagnostics: [{
        code: "TN_SCENE_MODULAR_TRACK_READ_FAILED",
        message: `Could not read scene source JSON: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      }],
      filesWritten: [],
      ok: false,
      prefix: options.prefix,
      projectPath: options.projectPath,
      tileCount: 0,
    };
  }

  const assetDir = isAbsolute(options.assetDir) ? options.assetDir : resolve(options.projectPath, options.assetDir);
  const prefabs = ensureSceneArray(scene, "prefabs");
  const entities = ensureSceneArray(scene, "entities");
  removeGeneratedItems(prefabs, options.prefix);
  removeGeneratedItems(entities, options.prefix);
  let tileCount = 0;

  for (const [index, tile] of options.layout.entries()) {
    const assetPath = resolve(assetDir, tile.asset);
    const inspection = await inspectAsset(assetPath);
    diagnostics.push(...inspection.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => ({
        code: diagnostic.code,
        file: relative(options.projectPath, assetPath),
        message: diagnostic.message,
        severity: diagnostic.severity,
      })));
    if (inspection.code !== "TN_ASSET_INSPECT_OK" || inspection.modular === undefined) {
      continue;
    }

    const prefabId = `${options.prefix}.prefab.${assetIdStem(tile.asset)}`;
    const entityId = `${options.prefix}.${String(index).padStart(3, "0")}`;
    const placement = inspection.modular.placement.cardinalYaw.find((candidate) => candidate.yawDegrees === tile.yaw);
    if (placement === undefined) {
      diagnostics.push({
        code: "TN_SCENE_MODULAR_TRACK_YAW_UNSUPPORTED",
        message: `No cardinal placement was available for yaw ${tile.yaw}.`,
        severity: "error",
      });
      continue;
    }

    const centerX = tile.center[0];
    const centerY = tile.center.length === 3 ? tile.center[1] : 0;
    const centerZ = tile.center.length === 3 ? tile.center[2] : tile.center[1];
    const corrected = placement.entityPositionForFootprintCenterAtOrigin;
    upsertById(prefabs, {
      id: prefabId,
      primitive: "box",
      asset: normalizePath(relative(options.projectPath, assetPath)),
      color: "#777267",
    });
    upsertById(entities, {
      id: entityId,
      prefab: prefabId,
      transform: {
        position: [round(centerX + corrected[0]), round(centerY + corrected[1]), round(centerZ + corrected[2])],
        rotation: [0, round(tile.yaw * Math.PI / 180), 0],
        scale: [1, 1, 1],
      },
      components: {
        ModularTrackTile: {
          asset: normalizePath(relative(options.projectPath, assetPath)),
          center: tile.center,
          footprint: inspection.modular.footprint.size,
          yawDegrees: tile.yaw,
        },
      },
    });
    tileCount += 1;
  }

  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  if (hasErrors) {
    return {
      changed: false,
      diagnostics,
      filesWritten: [],
      ok: false,
      prefix: options.prefix,
      projectPath: options.projectPath,
      tileCount,
    };
  }

  await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`);
  return {
    changed: true,
    diagnostics,
    filesWritten: [inspectedScene.scene.file],
    ok: true,
    prefix: options.prefix,
    projectPath: options.projectPath,
    tileCount,
  };
}

export async function proofModularTrack(options: {
  actorIds: string[];
  assetDir: string;
  prefix: string;
  projectPath: string;
  sceneId: string;
}): Promise<IAuthoringOperationResult & {
  actorReports: Array<{
    actorId: string;
    footprintWidth: number;
    laneWidth: number;
    ratio: number;
    tileId: string;
    verdict: "ok" | "too-large";
  }>;
  prefix: string;
  tileCount: number;
}> {
  const inspectedScene = await inspectScene({ projectPath: options.projectPath, sceneId: options.sceneId });
  if (inspectedScene.scene === undefined) {
    return { ...inspectedScene, actorReports: [], prefix: options.prefix, tileCount: 0 };
  }

  const scenePath = resolve(options.projectPath, inspectedScene.scene.file);
  const diagnostics = inspectedScene.diagnostics.filter((diagnostic) => !isGeneratedPrefixDiagnostic(diagnostic, options.prefix));
  let scene: SceneRecord;
  try {
    scene = JSON.parse(await readFile(scenePath, "utf8")) as SceneRecord;
  } catch (error) {
    return {
      changed: false,
      diagnostics: [{
        code: "TN_SCENE_MODULAR_TRACK_READ_FAILED",
        message: `Could not read scene source JSON: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      }],
      filesWritten: [],
      ok: false,
      actorReports: [],
      prefix: options.prefix,
      projectPath: options.projectPath,
      tileCount: 0,
    };
  }

  const assetDir = isAbsolute(options.assetDir) ? options.assetDir : resolve(options.projectPath, options.assetDir);
  const tiles: Array<{
    asset: string;
    connectors: ModularConnectorDirection[];
    ports: Array<{ axis: "x" | "z"; direction: ModularConnectorDirection; interval: [number, number]; line: number }>;
    roadBounds: { min: [number, number]; max: [number, number] };
    id: string;
  }> = [];
  const actorReports: Array<{
    actorId: string;
    footprintWidth: number;
    laneWidth: number;
    ratio: number;
    tileId: string;
    verdict: "ok" | "too-large";
  }> = [];
  for (const entity of ensureSceneArray(scene, "entities")) {
    const id = entity.id;
    if (typeof id !== "string" || !id.startsWith(`${options.prefix}.`)) {
      continue;
    }
    const component = ((entity.components as SceneRecord | undefined)?.ModularTrackTile) as SceneRecord | undefined;
    const asset = typeof component?.asset === "string" ? component.asset : undefined;
    const yaw = component?.yawDegrees;
    const center = Array.isArray(component?.center) ? component.center : undefined;
    if (asset === undefined || !isCardinalYaw(yaw) || !isCenterVector(center)) {
      diagnostics.push({
        code: "TN_SCENE_MODULAR_TRACK_TILE_METADATA_INVALID",
        message: `Generated modular tile '${id}' is missing asset, center, or cardinal yaw metadata.`,
        path: id,
        severity: "error",
      });
      continue;
    }
    const inspection = await inspectAsset(resolve(assetDir, asset.startsWith("assets/") ? asset.slice("assets/".length) : asset));
    const placement = inspection.modular?.connectors?.cardinalYaw.find((candidate) => candidate.yawDegrees === yaw);
    const ports = inspection.modular?.connectors?.roadPorts.cardinalYaw.find((candidate) => candidate.yawDegrees === yaw)?.ports;
    const roadBounds = inspection.modular?.connectors?.roadBounds.cardinalYaw.find((candidate) => candidate.yawDegrees === yaw)?.bounds;
    const position = (entity.transform as SceneRecord | undefined)?.position;
    if (placement === undefined || ports === undefined || roadBounds === undefined || !isVector3(position)) {
      diagnostics.push({
        code: "TN_SCENE_MODULAR_TRACK_CONNECTORS_UNAVAILABLE",
        message: `Tile '${id}' asset '${asset}' has no material-derived connector data or transform position for yaw ${yaw}.`,
        path: id,
        severity: "error",
      });
      continue;
    }
    tiles.push({
      asset,
      connectors: placement.edges,
      id,
      ports: ports.map((port) => worldConnectorPort(port, position)),
      roadBounds: {
        min: [round(position[0] + roadBounds.min[0]), round(position[2] + roadBounds.min[1])],
        max: [round(position[0] + roadBounds.max[0]), round(position[2] + roadBounds.max[1])],
      },
    });
  }

  for (const tile of tiles) {
    for (const connector of tile.connectors) {
      const opposite = oppositeConnector(connector);
      const port = tile.ports.find((candidate) => candidate.direction === connector);
      if (port === undefined) {
        diagnostics.push({
          code: "TN_SCENE_MODULAR_TRACK_PORT_MISSING",
          message: `Tile '${tile.id}' has no material-derived ${connector} connector port.`,
          path: tile.id,
          severity: "error",
        });
        continue;
      }
      const neighbor = tiles.find((candidate) => candidate.id !== tile.id
        && candidate.connectors.includes(opposite)
        && candidate.ports.some((candidatePort) => candidatePort.direction === opposite && portsTouch(port, candidatePort)));
      if (neighbor === undefined) {
        diagnostics.push({
          code: "TN_SCENE_MODULAR_TRACK_OPEN_CONNECTOR",
          message: `Tile '${tile.id}' has an open ${connector} connector at line ${port.line}; no opposite connector shares that seam with an overlapping road interval.`,
          path: tile.id,
          severity: "error",
        });
      }
    }
  }

  for (const actorId of options.actorIds) {
    const actor = ensureSceneArray(scene, "entities").find((entity) => entity.id === actorId);
    const position = (actor?.transform as SceneRecord | undefined)?.position;
    if (actor === undefined || !isVector3(position)) {
      diagnostics.push({
        code: "TN_SCENE_MODULAR_TRACK_ACTOR_MISSING",
        message: `Actor '${actorId}' is missing or has no transform position.`,
        path: actorId,
        severity: "error",
      });
      continue;
    }
    const point: [number, number] = [position[0], position[2]];
    const road = tiles.find((tile) => pointInBounds(point, tile.roadBounds, 0.08));
    if (road === undefined) {
      diagnostics.push({
        code: "TN_SCENE_MODULAR_TRACK_ACTOR_OFF_ROAD",
        message: `Actor '${actorId}' at [${round(point[0])}, ${round(point[1])}] is outside the material-derived road surface.`,
        path: actorId,
        severity: "error",
      });
      continue;
    }
    const footprintWidth = actorFootprintWidth(actor);
    const laneWidth = roadLaneWidth(road.roadBounds);
    const ratio = laneWidth > 0 ? round(footprintWidth / laneWidth) : 0;
    const verdict = ratio > 0.8 ? "too-large" : "ok";
    actorReports.push({
      actorId,
      footprintWidth,
      laneWidth,
      ratio,
      tileId: road.id,
      verdict,
    });
    if (verdict === "too-large") {
      diagnostics.push({
        code: "TN_SCENE_MODULAR_TRACK_VEHICLE_TOO_LARGE_FOR_LANE",
        message: `Actor '${actorId}' footprint ${footprintWidth}m uses ${ratio}x of lane width ${laneWidth}m on tile '${road.id}'.`,
        path: actorId,
        severity: "warning",
        suggestion: "Reduce the actor X/Z scale, widen the authored road surface, or adjust camera/readability instead of making the vehicle physically incoherent.",
      });
    }
  }

  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return {
    changed: false,
    diagnostics,
    filesWritten: [],
    ok: !hasErrors,
    actorReports,
    prefix: options.prefix,
    projectPath: options.projectPath,
    tileCount: tiles.length,
  };
}

function parseModularTrackSize(raw: string | undefined): ModularTrackSize | undefined {
  if (raw === undefined) {
    return "medium";
  }
  return raw === "small" || raw === "medium" || raw === "large" ? raw : undefined;
}

function straightCountForTrackSize(size: ModularTrackSize): number {
  return size === "small" ? 5 : size === "medium" ? 9 : 13;
}

function isCenterVector(value: unknown): value is [number, number] | [number, number, number] {
  return Array.isArray(value) && (value.length === 2 || value.length === 3) && value.every((item) => Number.isFinite(item));
}

function isCardinalYaw(value: unknown): value is 0 | 90 | 180 | 270 {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

function actorFootprintWidth(actor: SceneRecord): number {
  const transform = actor.transform as SceneRecord | undefined;
  const scale = vectorFromRecord(transform, "scale", [1, 1, 1]);
  return round(Math.max(Math.abs(scale[0]), Math.abs(scale[2]), 0.25));
}

function roadLaneWidth(bounds: { min: [number, number]; max: [number, number] }): number {
  const widthX = Math.abs(bounds.max[0] - bounds.min[0]);
  const widthZ = Math.abs(bounds.max[1] - bounds.min[1]);
  return round(Math.max(0, Math.min(widthX, widthZ)));
}

function oppositeConnector(connector: ModularConnectorDirection): ModularConnectorDirection {
  if (connector === "east") return "west";
  if (connector === "west") return "east";
  if (connector === "north") return "south";
  return "north";
}

function worldConnectorPort(port: { direction: ModularConnectorDirection; interval: [number, number]; line: number }, position: [number, number, number]): { axis: "x" | "z"; direction: ModularConnectorDirection; interval: [number, number]; line: number } {
  if (port.direction === "east" || port.direction === "west") {
    return {
      axis: "x",
      direction: port.direction,
      interval: [round(position[2] + port.interval[0]), round(position[2] + port.interval[1])],
      line: round(position[0] + port.line),
    };
  }
  return {
    axis: "z",
    direction: port.direction,
    interval: [round(position[0] + port.interval[0]), round(position[0] + port.interval[1])],
    line: round(position[2] + port.line),
  };
}

function portsTouch(a: { axis: "x" | "z"; interval: [number, number]; line: number }, b: { axis: "x" | "z"; interval: [number, number]; line: number }): boolean {
  if (a.axis !== b.axis || Math.abs(a.line - b.line) > 0.08) {
    return false;
  }
  return Math.abs(a.interval[0] - b.interval[0]) <= 0.08 && Math.abs(a.interval[1] - b.interval[1]) <= 0.08;
}

function pointInBounds(point: [number, number], bounds: { min: [number, number]; max: [number, number] }, tolerance: number): boolean {
  return point[0] >= bounds.min[0] - tolerance
    && point[0] <= bounds.max[0] + tolerance
    && point[1] >= bounds.min[1] - tolerance
    && point[1] <= bounds.max[1] + tolerance;
}

function ensureSceneArray(scene: SceneRecord, key: "entities" | "prefabs"): SceneRecord[] {
  const existing = scene[key];
  if (Array.isArray(existing)) {
    return existing as SceneRecord[];
  }
  const next: SceneRecord[] = [];
  scene[key] = next;
  return next;
}

function vectorFromRecord(record: SceneRecord | undefined, key: string, fallback: [number, number, number]): [number, number, number] {
  const value = record?.[key];
  return isVector3(value) ? value : fallback;
}

function upsertById(items: SceneRecord[], item: SceneRecord & { id: string }): void {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) {
    items.push(item);
    return;
  }
  items[index] = item;
}

function assetIdStem(asset: string): string {
  return basename(asset, extname(asset)).replace(/[^a-zA-Z0-9_.-]+/g, "-").toLowerCase();
}

function removeGeneratedItems(items: SceneRecord[], prefix: string): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const id = items[index]?.id;
    if (typeof id === "string" && id.startsWith(`${prefix}.`)) {
      items.splice(index, 1);
    }
  }
}

function isGeneratedPrefixDiagnostic(diagnostic: { message?: string; value?: unknown }, prefix: string): boolean {
  return String(diagnostic.value ?? "").startsWith(`${prefix}.`) || String(diagnostic.message ?? "").includes(`${prefix}.`);
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}
