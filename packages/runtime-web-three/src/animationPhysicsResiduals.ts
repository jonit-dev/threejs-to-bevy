import type { IAnimationsIr, IAssetsManifest, IWorldIr, Vec3 } from "@threenative/ir";
import { sampleTransformAnimations, type ITransformAnimationSample } from "./animation.js";
import { traceCharacterControllers, type ICharacterTraceObservation } from "./character.js";
import { traceNavigationPaths, type INavigationPathResult } from "./navigation.js";
import { tracePhysicsJoints, traceRigidBodyPrimitive, type IPhysicsJointObservation, type IRigidBodyTraceObservation } from "./physics.js";

type ModelAsset = Extract<IAssetsManifest["assets"][number], { kind: "model" }> & {
  animations?: Array<{ id: string; mask?: string }>;
  masks?: Array<{ id: string; joints: string[] }>;
  morphClips?: Array<{ id: string; keyframes: Array<{ timeSeconds: number; weight: number }>; target: string }>;
};

export interface IAnimationPhysicsResidualReport {
  animation: {
    masks: IAnimationMaskObservation[];
    morphTargets: IMorphTargetObservation[];
    propertySamples: ITransformAnimationSample[];
  };
  navigation: {
    crowd: ICrowdObservation[];
    offMeshLinks: IOffMeshLinkObservation[];
    paths: INavigationPathResult[];
    rebake?: { intervalMs: number; maxObstacles: number; maxRegions: number; status: "bounded" };
  };
  physics: {
    characterGrounding: ICharacterTraceObservation[];
    joints: IPhysicsJointObservation[];
    solver: IRigidBodyTraceObservation[];
  };
  schema: "threenative.animation-physics-residuals";
  version: "0.1.0";
}

export interface IAnimationMaskObservation {
  asset: string;
  clips: string[];
  id: string;
  joints: string[];
}

export interface IMorphTargetObservation {
  asset: string;
  clip: string;
  target: string;
  timeSeconds: number;
  weight: number;
}

export interface IOffMeshLinkObservation {
  from: string;
  id: string;
  status: "traversed";
  to: string;
}

export interface ICrowdObservation {
  agent: string;
  goal: Vec3;
  position: Vec3;
}

export function traceAnimationPhysicsResiduals(
  assets: IAssetsManifest,
  world: IWorldIr,
  animations?: IAnimationsIr,
  options: { fixedDelta?: number; morphTimeSeconds?: number } = {},
): IAnimationPhysicsResidualReport {
  const fixedDelta = options.fixedDelta ?? 1;
  return {
    animation: {
      masks: traceAnimationMasks(assets),
      morphTargets: traceMorphTargets(assets, options.morphTimeSeconds ?? 0.5),
      propertySamples: sampleTransformAnimations(animations, { timeSeconds: fixedDelta }),
    },
    navigation: traceNavigationResiduals(world),
    physics: {
      characterGrounding: traceCharacterControllers(world, { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta }),
      joints: tracePhysicsJoints(world),
      solver: traceRigidBodyPrimitive(cloneWorld(world), { fixedDelta: 0.25, steps: 4 }),
    },
    schema: "threenative.animation-physics-residuals",
    version: "0.1.0",
  };
}

function traceAnimationMasks(assets: IAssetsManifest): IAnimationMaskObservation[] {
  return modelAssets(assets).flatMap((asset) => {
    const masks = Array.isArray((asset as any).masks) ? (asset as any).masks as Array<{ id: string; joints: string[] }> : [];
    return masks.map((mask) => ({
      asset: asset.id,
      clips: (asset.animations ?? []).filter((clip) => (clip as { mask?: string }).mask === mask.id).map((clip) => clip.id).sort(),
      id: mask.id,
      joints: [...mask.joints].sort(),
    }));
  }).sort((left, right) => left.asset.localeCompare(right.asset) || left.id.localeCompare(right.id));
}

function traceMorphTargets(assets: IAssetsManifest, timeSeconds: number): IMorphTargetObservation[] {
  return modelAssets(assets).flatMap((asset) => {
    const clips = Array.isArray((asset as any).morphClips)
      ? (asset as any).morphClips as Array<{ id: string; keyframes: Array<{ timeSeconds: number; weight: number }>; target: string }>
      : [];
    return clips.map((clip) => ({
      asset: asset.id,
      clip: clip.id,
      target: clip.target,
      timeSeconds: round(sampleTime(clip.keyframes, timeSeconds)),
      weight: sampleWeight(clip.keyframes, timeSeconds),
    }));
  }).sort((left, right) => left.asset.localeCompare(right.asset) || left.clip.localeCompare(right.clip) || left.target.localeCompare(right.target));
}

function traceNavigationResiduals(world: IWorldIr): IAnimationPhysicsResidualReport["navigation"] {
  const navigation = world.resources?.Navigation as any;
  return {
    crowd: traceCrowd(navigation?.crowd),
    offMeshLinks: Array.isArray(navigation?.offMeshLinks)
      ? (navigation.offMeshLinks as Array<{ from: string; id: string; to: string }>).map((link) => ({ from: link.from, id: link.id, status: "traversed" as const, to: link.to })).sort((left, right) => left.id.localeCompare(right.id))
      : [],
    paths: traceNavigationPaths(world),
    ...(navigation?.dynamicRebake === undefined
      ? {}
      : { rebake: { intervalMs: navigation.dynamicRebake.intervalMs, maxObstacles: navigation.dynamicRebake.maxObstacles, maxRegions: navigation.dynamicRebake.maxRegions, status: "bounded" as const } }),
  };
}

function traceCrowd(crowd: any): ICrowdObservation[] {
  if (!Array.isArray(crowd?.agents)) {
    return [];
  }
  const separation = typeof crowd.separationRadius === "number" ? crowd.separationRadius : 0;
  return crowd.agents.map((agent: { goal: Vec3; id: string; position: Vec3 }, index: number) => ({
    agent: agent.id,
    goal: agent.goal,
    position: [round(agent.position[0] + separation * index), round(agent.position[1]), round(agent.position[2])] as Vec3,
  })).sort((left: ICrowdObservation, right: ICrowdObservation) => left.agent.localeCompare(right.agent));
}

function modelAssets(assets: IAssetsManifest): ModelAsset[] {
  return assets.assets.filter((asset) => asset.kind === "model") as ModelAsset[];
}

function sampleTime(keyframes: Array<{ timeSeconds: number }>, timeSeconds: number): number {
  const last = keyframes.at(-1)?.timeSeconds ?? 0;
  return Math.min(Math.max(0, timeSeconds), last);
}

function sampleWeight(keyframes: Array<{ timeSeconds: number; weight: number }>, timeSeconds: number): number {
  const clamped = sampleTime(keyframes, timeSeconds);
  const first = keyframes[0];
  const last = keyframes.at(-1);
  if (first === undefined || last === undefined || clamped <= first.timeSeconds) {
    return round(first?.weight ?? 0);
  }
  if (clamped >= last.timeSeconds) {
    return round(last.weight);
  }
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.timeSeconds >= clamped);
  const next = keyframes[nextIndex] ?? last;
  const previous = keyframes[nextIndex - 1] ?? first;
  const alpha = (clamped - previous.timeSeconds) / (next.timeSeconds - previous.timeSeconds);
  return round(previous.weight + (next.weight - previous.weight) * alpha);
}

function cloneWorld(world: IWorldIr): IWorldIr {
  return JSON.parse(JSON.stringify(world)) as IWorldIr;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
