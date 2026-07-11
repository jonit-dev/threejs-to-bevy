import {
  BufferGeometry,
  DoubleSide,
  Matrix3,
  Matrix4,
  Ray,
  Vector3,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

export type SceneRayVec3 = readonly [number, number, number];

export interface ISceneRayHit {
  distance: number;
  entityId: string;
  normal: SceneRayVec3;
  point: SceneRayVec3;
}

export interface ISceneRayQuery {
  occluded(from: SceneRayVec3, to: SceneRayVec3): boolean;
  raycast(origin: SceneRayVec3, direction: SceneRayVec3, maxDistance: number): ISceneRayHit | null;
}

export interface ISceneRayQueryInstance {
  entityId: string;
  geometry: BufferGeometry;
  matrixWorld: Matrix4;
}

/**
 * Tooling-only scene ray queries over immutable rendered geometry.
 *
 * The upstream direct-query contract requires local-space rays and returns
 * local-space hits. Keep that conversion here so MeshBVH never leaks through
 * the engine-internal interface.
 * Source: https://github.com/gkjohnson/three-mesh-bvh#querying-the-bvh-directly
 */
export class ToolingSceneRayQuery implements ISceneRayQuery {
  private readonly boundsByGeometry = new Map<BufferGeometry, MeshBVH>();
  private readonly instances: Array<{ bounds: MeshBVH; entityId: string; inverseWorld: Matrix4; matrixWorld: Matrix4; normalMatrix: Matrix3 }>;

  public constructor(instances: readonly ISceneRayQueryInstance[]) {
    this.instances = instances.map((instance) => {
      let bounds = this.boundsByGeometry.get(instance.geometry);
      if (bounds === undefined) {
        bounds = new MeshBVH(instance.geometry);
        this.boundsByGeometry.set(instance.geometry, bounds);
      }
      const matrixWorld = instance.matrixWorld.clone();
      return {
        bounds,
        entityId: instance.entityId,
        inverseWorld: matrixWorld.clone().invert(),
        matrixWorld,
        normalMatrix: new Matrix3().getNormalMatrix(matrixWorld),
      };
    });
  }

  public occluded(from: SceneRayVec3, to: SceneRayVec3): boolean {
    const origin = tupleVector(from);
    const delta = tupleVector(to).sub(origin);
    const distance = delta.length();
    if (distance <= 1e-8) return false;
    return this.raycast(from, vectorTuple(delta.normalize()), Math.max(0, distance - 1e-6)) !== null;
  }

  public raycast(originTuple: SceneRayVec3, directionTuple: SceneRayVec3, maxDistance: number): ISceneRayHit | null {
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) return null;
    const worldOrigin = tupleVector(originTuple);
    const worldDirection = tupleVector(directionTuple);
    if (worldDirection.lengthSq() <= 1e-16) return null;
    worldDirection.normalize();
    let closest: ISceneRayHit | null = null;

    for (const instance of this.instances) {
      const localOrigin = worldOrigin.clone().applyMatrix4(instance.inverseWorld);
      const localDirection = worldDirection.clone().transformDirection(instance.inverseWorld);
      const intersection = instance.bounds.raycastFirst(new Ray(localOrigin, localDirection), DoubleSide);
      if (intersection === null || intersection.face === null || intersection.face === undefined) continue;
      const worldPoint = intersection.point.clone().applyMatrix4(instance.matrixWorld);
      const distance = worldPoint.distanceTo(worldOrigin);
      if (distance > maxDistance || (closest !== null && distance >= closest.distance)) continue;
      const worldNormal = intersection.face.normal.clone().applyMatrix3(instance.normalMatrix).normalize();
      closest = {
        distance,
        entityId: instance.entityId,
        normal: vectorTuple(worldNormal),
        point: vectorTuple(worldPoint),
      };
    }

    return closest;
  }

  public resourceObservation(): { geometryCount: number; instanceCount: number } {
    return { geometryCount: this.boundsByGeometry.size, instanceCount: this.instances.length };
  }
}

function tupleVector(value: SceneRayVec3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function vectorTuple(value: Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}
