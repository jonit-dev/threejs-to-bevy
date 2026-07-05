import type { IUiAttachmentIr, IUiIr, IUiNodeIr, Vec3 } from "@threenative/ir";

export interface IUiAttachmentEntityState {
  id: string;
  position: Vec3;
}

export interface IUiAttachmentCameraState {
  id: string;
  position?: Vec3;
  viewport: { height: number; width: number };
}

export interface IUiAttachmentProjectionTrace {
  projections: IUiAttachmentProjection[];
}

export interface IUiAttachmentProjection {
  camera: string;
  clamped: boolean;
  depth: number;
  node: string;
  occluded: boolean;
  scale: number;
  screen: { x: number; y: number };
  target: string;
  visibleNodes: string[];
}

export function traceUiAttachments(ui: IUiIr, entities: readonly IUiAttachmentEntityState[], camera: IUiAttachmentCameraState): IUiAttachmentProjectionTrace {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity.position]));
  const projections: IUiAttachmentProjection[] = [];
  collectAttachmentProjections(ui.root, entityMap, camera, projections);
  projections.sort((left, right) => left.node.localeCompare(right.node));
  return { projections };
}

function collectAttachmentProjections(node: IUiNodeIr, entities: Map<string, Vec3>, camera: IUiAttachmentCameraState, projections: IUiAttachmentProjection[]): void {
  const attach = node.attachTo;
  if (attach?.target.kind === "entity" && attach.target.id !== undefined) {
    const position = entities.get(attach.target.id);
    if (position !== undefined) {
      const offset = attach.localOffset ?? [0, 0, 0];
      const cameraPosition = camera.position ?? [0, 0, 0];
      const world: Vec3 = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]];
      const depth = world[2] - cameraPosition[2];
      const unclamped = {
        x: camera.viewport.width / 2 + (world[0] - cameraPosition[0]),
        y: camera.viewport.height / 2 - (world[1] - cameraPosition[1]),
      };
      const screen = attach.clamp === "screenEdge" ? clampToViewport(unclamped, camera.viewport) : unclamped;
      projections.push({
        camera: camera.id,
        clamped: screen.x !== unclamped.x || screen.y !== unclamped.y,
        depth,
        node: node.id,
        occluded: false,
        scale: distanceScale(attach.distanceScale, depth),
        screen,
        target: attach.target.id,
        visibleNodes: [node.id, ...(node.children ?? []).map((child) => child.id)],
      });
    }
  }
  node.children?.forEach((child) => collectAttachmentProjections(child, entities, camera, projections));
}

function clampToViewport(position: { x: number; y: number }, viewport: { height: number; width: number }): { x: number; y: number } {
  return {
    x: Math.min(Math.max(position.x, 0), viewport.width),
    y: Math.min(Math.max(position.y, 0), viewport.height),
  };
}

function distanceScale(scale: IUiAttachmentIr["distanceScale"], depth: number): number {
  if (scale === undefined) {
    return 1;
  }
  const normalized = Math.max(0, Math.min(1, Math.abs(depth) / 100));
  return scale.max - (scale.max - scale.min) * normalized;
}
