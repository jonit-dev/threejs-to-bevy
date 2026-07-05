import type { IAssetsManifest, IWorldIr } from "@threenative/ir";

export function residualAssets(): IAssetsManifest {
  return {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [
      {
        animations: [{ id: "wave", mask: "upperBody" }],
        format: "glb",
        id: "model.hero",
        kind: "model",
        masks: [{ id: "upperBody", joints: ["Spine", "Arm.L", "Arm.R"] }],
        morphClips: [{ id: "smile", target: "Smile", keyframes: [{ timeSeconds: 0, weight: 0 }, { timeSeconds: 1, weight: 1 }] }],
        morphTargets: [{ defaultWeight: 0, id: "Smile" }],
        particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 8, ratePerSecond: 8, shape: "point" }],
        path: "assets/hero.glb",
        skeleton: { joints: ["Root", "Spine", "Arm.L", "Arm.R"] },
      },
    ],
  } as unknown as IAssetsManifest;
}

export function residualWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        components: {
          Collider: { kind: "box", size: [12, 0.2, 8] },
          RigidBody: { kind: "static" },
          Transform: { position: [0, 0, 0] },
        },
        id: "floor",
      },
      {
        components: {
          Collider: { kind: "box", size: [4, 1, 2], slope: { axis: "x", direction: 1, rise: 1, run: 2 } },
          RigidBody: { kind: "static" },
          Transform: { position: [2, 0.5, 0] },
        },
        id: "ramp",
      },
      {
        components: {
          CharacterController: { blocking: true, grounding: "raycast", moveXAxis: "MoveX", moveZAxis: "MoveZ", slopeLimit: 45, speed: 2 },
          Collider: { kind: "box", size: [1, 1, 1] },
          Transform: { position: [0, 1, 0] },
        },
        id: "player",
      },
    ],
    resources: {
      Navigation: {
        agentRadius: 0.4,
        crowd: {
          agents: [
            { goal: [2, 0, 0], id: "agent.a", position: [0, 0, 0] },
            { goal: [2, 0, 0], id: "agent.b", position: [0, 0, 0] },
          ],
          maxAgents: 4,
          separationRadius: 0.25,
        },
        dynamicRebake: { intervalMs: 100, maxObstacles: 4, maxRegions: 8 },
        offMeshLinks: [{ cost: 1, from: "a", id: "jump.a.b", to: "b" }],
        regions: [
          { area: "default", center: [0, 0, 0], id: "a", neighbors: ["b"], points: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
          { area: "default", center: [2, 0, 0], id: "b", neighbors: ["a"], points: [[1, -1], [3, -1], [3, 1], [1, 1]] },
        ],
        queries: [{ goal: [2, 0, 0], id: "path.a.b", start: [0, 0, 0] }],
      },
    },
  };
}
