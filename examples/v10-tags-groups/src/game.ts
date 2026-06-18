import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  World,
  defineComponent,
  defineGame,
  defineQuery,
  defineResource,
  defineSystem,
  defineTag,
} from "@threenative/sdk";
import { Text, Ui } from "@threenative/ui";

const scene = new Scene({ id: "v10.tags.groups.scene" });
const world = new World();

const LaneRed = defineTag("LaneRed");
const LaneTeal = defineTag("LaneTeal");
const LaneGold = defineTag("LaneGold");
const ParallelMover = defineTag("ParallelMover");
const PhaseActive = defineTag("PhaseActive");
const PhaseCooldown = defineTag("PhaseCooldown");
const CountdownState = defineResource("CountdownState", {
  value: "integer",
});
const MotionLane = defineComponent("MotionLane", {
  amplitude: "number",
  baseY: "number",
  lane: "string",
  offset: "number",
  speed: "number",
});
const ColorPhase = defineComponent("ColorPhase", {
  phase: "string",
});
const Transform = defineComponent("Transform", {
  position: { kind: "vec3", required: false },
  rotation: { kind: "quat", required: false },
  scale: { kind: "vec3", required: false },
});
const MeshRenderer = defineComponent("MeshRenderer", {
  castShadow: { kind: "boolean", required: false },
  material: "string",
  mesh: "string",
  receiveShadow: { kind: "boolean", required: false },
  visible: { kind: "boolean", required: false },
});

function laneMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, metalness: 0, roughness: 0.7 });
}

const materials = {
  goldActive: laneMaterial("#d48a10"),
  goldCooldown: laneMaterial("#f0d56c"),
  redActive: laneMaterial("#d82f2f"),
  redCooldown: laneMaterial("#e58c94"),
  tealActive: laneMaterial("#15906f"),
  tealCooldown: laneMaterial("#80d0ba"),
};

const cubeGeometry = new BoxGeometry({ size: [0.44, 0.44, 0.44] });

const lanes = [
  {
    groupId: "group.lane.red",
    lane: "red",
    tags: [LaneRed],
    x: -2.2,
    cubes: [
      { id: "cube.red.leading", material: materials.redActive, phase: PhaseActive, slot: "leading", y: -0.45, z: 0.2 },
      { id: "cube.red.middle", material: materials.redCooldown, phase: PhaseCooldown, slot: "middle", y: 0.15, z: -0.25 },
      { id: "cube.red.trailing", material: materials.redActive, phase: PhaseActive, slot: "trailing", y: 0.75, z: -0.7 },
    ],
  },
  {
    groupId: "group.lane.teal",
    lane: "teal",
    tags: [LaneTeal],
    x: 0,
    cubes: [
      { id: "cube.teal.leading", material: materials.tealCooldown, phase: PhaseCooldown, slot: "leading", y: -0.45, z: 0.2 },
      { id: "cube.teal.middle", material: materials.tealActive, phase: PhaseActive, slot: "middle", y: 0.15, z: -0.25 },
      { id: "cube.teal.trailing", material: materials.tealCooldown, phase: PhaseCooldown, slot: "trailing", y: 0.75, z: -0.7 },
    ],
  },
  {
    groupId: "group.lane.gold",
    lane: "gold",
    tags: [LaneGold],
    x: 2.2,
    cubes: [
      { id: "cube.gold.leading", material: materials.goldActive, phase: PhaseActive, slot: "leading", y: -0.45, z: 0.2 },
      { id: "cube.gold.middle", material: materials.goldCooldown, phase: PhaseCooldown, slot: "middle", y: 0.15, z: -0.25 },
      { id: "cube.gold.trailing", material: materials.goldActive, phase: PhaseActive, slot: "trailing", y: 0.75, z: -0.7 },
    ],
  },
] as const;

world.addResource(CountdownState({ value: 3 }));

for (const lane of lanes) {
  const group = new Object3D({ id: lane.groupId });
  group.position.set(lane.x, 0, 0);
  scene.add(group);

  for (const cube of lane.cubes) {
    const mesh = new Mesh({
      castShadow: true,
      geometry: cubeGeometry,
      id: cube.id,
      material: cube.material,
      receiveShadow: true,
    });
    mesh.position.set(0, cube.y, cube.z);
    group.add(mesh);

    world.spawn(
      cube.id,
      ParallelMover(),
      cube.phase(),
      ...lane.tags.map((tag) => tag()),
      Transform({ position: [0, cube.y, cube.z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }),
      MeshRenderer({
        castShadow: true,
        material: `mat.${cube.id}`,
        mesh: `mesh.${cube.id}`,
        receiveShadow: true,
      }),
      MotionLane({ amplitude: 0.18, baseY: cube.y, lane: lane.lane, offset: cube.z * -2.3, speed: lane.lane === "teal" ? 1.4 : 1.1 }),
      ColorPhase({ phase: cube.phase.name }),
    );
  }
}

world.addSystem(
  defineSystem(
    {
      id: "laneTagProbe",
      queries: [
        defineQuery({ orderBy: "id", with: [ParallelMover, LaneRed, MotionLane, Transform] }),
        defineQuery({ orderBy: "id", with: [ParallelMover, LaneTeal, MotionLane, Transform] }),
        defineQuery({ orderBy: "id", with: [ParallelMover, LaneGold, MotionLane, Transform] }),
        defineQuery({ orderBy: "id", with: [ParallelMover, PhaseActive], without: [PhaseCooldown] }),
      ],
      resourceWrites: [CountdownState],
      reads: [ColorPhase, MeshRenderer, MotionLane, Transform],
      stage: "update",
      writes: [MeshRenderer, Transform],
    },
    (context) => {
      const materialByLane = {
        gold: {
          leading: "mat.cube.gold.leading",
          middle: "mat.cube.gold.middle",
          trailing: "mat.cube.gold.trailing",
        },
        red: {
          leading: "mat.cube.red.leading",
          middle: "mat.cube.red.middle",
          trailing: "mat.cube.red.trailing",
        },
        teal: {
          leading: "mat.cube.teal.leading",
          middle: "mat.cube.teal.middle",
          trailing: "mat.cube.teal.trailing",
        },
      };
      const countdown = 3 - (Math.floor(context.time.elapsed) % 3);
      const cycle = ["red", "teal", "gold"];
      const rotation = Math.floor(context.time.elapsed / 3) % cycle.length;
      const laneQueries = [
        { lane: "red", query: { with: ["ParallelMover", "LaneRed", "MotionLane", "Transform"] } },
        { lane: "teal", query: { with: ["ParallelMover", "LaneTeal", "MotionLane", "Transform"] } },
        { lane: "gold", query: { with: ["ParallelMover", "LaneGold", "MotionLane", "Transform"] } },
      ];

      context.resources.set("CountdownState", { value: countdown });

      for (let laneIndex = 0; laneIndex < laneQueries.length; laneIndex += 1) {
        const laneQuery = laneQueries[laneIndex];
        const sourceLane = cycle[(laneIndex + rotation) % cycle.length];
        for (const entity of context.query(laneQuery.query)) {
          const motion = entity.get<{ amplitude?: number; baseY?: number; offset?: number; speed?: number }>("MotionLane");
          const transform = entity.get<{ position?: [number, number, number] }>("Transform");
          const renderer = entity.get<{ material?: string; mesh?: string }>("MeshRenderer");
          const slot = entity.id.endsWith(".middle") ? "middle" : entity.id.endsWith(".trailing") ? "trailing" : "leading";
          const position = transform.position ?? [0, 0, 0];
          const wave = Math.sin(context.time.elapsed * (motion.speed ?? 1) + (motion.offset ?? 0)) * (motion.amplitude ?? 0);

          entity.patch("Transform", {
            position: [position[0], (motion.baseY ?? position[1]) + wave, position[2]],
          });
          entity.patch("MeshRenderer", {
            ...renderer,
            material: materialByLane[sourceLane][slot],
          });
        }
      }
    },
  ),
);

const camera = new PerspectiveCamera({ far: 100, fovY: 44, id: "camera.main", near: 0.1 });
camera.position.set(0, 0.35, 7);
scene.add(camera);
scene.setActiveCamera(camera);

const key = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 3.2 });
key.position.set(3, 5, 4);
scene.add(key);

const ui = Ui({
  id: "hud",
  children: Text({
    binding: { kind: "resource", name: "CountdownState", field: "value" },
    id: "hud.countdown",
    layout: { height: 96, inset: { bottom: 22, left: 0, right: 0 }, position: "absolute", width: 1280, zIndex: 10 },
    style: { color: "#f8fafc", fontSize: 72, fontWeight: "bold", textAlign: "center" },
    text: "3",
  }),
});

export default defineGame({ scene, ui, world });
