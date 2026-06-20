import {
  AmbientLight,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  World,
  commands,
  defineComponent,
  defineQuery,
  defineResource,
  defineRuntimeConfig,
  fixedUpdate,
} from "@threenative/sdk";
import { Column, Minimap, Row, Stack, Text, Ui } from "@threenative/ui";

const Transform = defineComponent("Transform", {
  position: { kind: "vec3", required: false },
  rotation: { kind: "quat", required: false },
  scale: { kind: "vec3", required: false },
});

const RigState = defineComponent("RigState", {
  progress: "number",
  yaw: "number",
});

const CameraHud = defineResource("CameraHud", {
  mode: "string",
  progress: "number",
});

const MinimapState = defineResource("MinimapState", {
  state: "string",
});

const scene = new Scene({ id: "bevy.camera.minimap.verification.scene" });

function mat(color: string, emissive = 0.05): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.55 });
}

const ground = new Mesh({ geometry: new BoxGeometry({ size: [36, 0.18, 30] }), id: "arena.ground", material: mat("#16321f") });
ground.position.set(0, -0.1, 0);
scene.add(ground);

const road = new Mesh({ geometry: new BoxGeometry({ size: [28, 0.08, 18] }), id: "arena.road", material: mat("#1f2937") });
road.position.set(0, 0.02, 0);
scene.add(road);

for (let i = 0; i < 16; i += 1) {
  const marker = new Mesh({ geometry: new BoxGeometry({ size: [0.35, 0.08, 1.0] }), id: `track.marker.${i}`, material: mat(i % 2 === 0 ? "#f8fafc" : "#f97316", 0.15) });
  const angle = (i / 16) * Math.PI * 2;
  marker.position.set(Math.sin(angle) * 11, 0.15, Math.cos(angle) * 7);
  marker.rotation.set(0, angle, 0);
  scene.add(marker);
}

const player = new Mesh({ geometry: new BoxGeometry({ size: [1.2, 0.65, 1.8] }), id: "player.rig", material: mat("#f97316", 0.35) });
player.position.set(0, 0.48, 7);
scene.add(player);

const nose = new Mesh({ geometry: new ConeGeometry({ height: 1.0, radius: 0.38 }), id: "player.nose", material: mat("#facc15", 0.45) });
nose.position.set(0, 0.85, 5.9);
nose.rotation.set(Math.PI / 2, 0, 0);
scene.add(nose);

for (const [id, x, z, color] of [
  ["landmark.blue", -10, -5, "#38bdf8"],
  ["landmark.pink", 10, 4, "#ec4899"],
  ["landmark.green", -5, 8, "#22c55e"],
] as const) {
  const tower = new Mesh({ geometry: new CylinderGeometry({ height: 2.8, radius: 0.45 }), id, material: mat(color, 0.35) });
  tower.position.set(x, 1.4, z);
  scene.add(tower);
}

const target = new Mesh({ geometry: new SphereGeometry({ radius: 0.38 }), id: "camera.target.dot", material: mat("#ffffff", 0.7) });
target.position.set(0, 1.5, 0);
scene.add(target);

const thirdPerson = new PerspectiveCamera({
  clear: { color: "#09111f", mode: "color" },
  far: 120,
  follow: { offset: [0, 4.2, 9.0], smoothing: 10, target: "player.rig" },
  fovY: 58,
  id: "camera.thirdPerson.follow",
  near: 0.1,
  order: 1,
  viewport: [0, 0.5, 0.5, 0.5],
});
thirdPerson.position.set(0, 4.2, 16);
scene.add(thirdPerson);

const firstPerson = new PerspectiveCamera({
  clear: { color: "#160b22", mode: "color" },
  far: 90,
  fovY: 72,
  id: "camera.firstPerson.rig",
  near: 0.1,
  order: 2,
  viewport: [0.5, 0.5, 0.5, 0.5],
});
firstPerson.position.set(0, 1.4, 6);
scene.add(firstPerson);

const orbit = new PerspectiveCamera({
  clear: { color: "#101a0b", mode: "color" },
  far: 120,
  fovY: 56,
  id: "camera.orbit.helper",
  near: 0.1,
  orbit: { distance: { min: 10, max: 18 }, smoothing: 9, target: "player.rig" },
  order: 3,
  viewport: [0, 0, 0.5, 0.5],
});
orbit.position.set(11, 9, 11);
scene.add(orbit);

const minimapCamera = new OrthographicCamera({
  clear: { color: "#04130b", mode: "color" },
  far: 80,
  id: "camera.minimap.renderLayer",
  layers: ["minimap"],
  near: 0.1,
  order: 4,
  size: 24,
  viewport: [0.5, 0, 0.5, 0.5],
});
minimapCamera.position.set(0, 26, 0);
minimapCamera.rotation.set(-Math.PI / 2, 0, 0);
scene.add(minimapCamera);

const minimapPlayer = new Mesh({ geometry: new BoxGeometry({ size: [1.4, 0.18, 1.4] }), id: "minimap.player.dot3d", layers: ["minimap"], material: mat("#f97316", 0.8) });
minimapPlayer.position.set(0, 0.3, 7);
scene.add(minimapPlayer);
const minimapPath = new Mesh({ geometry: new BoxGeometry({ size: [28, 0.12, 18] }), id: "minimap.track.path3d", layers: ["minimap"], material: mat("#334155", 0.2) });
minimapPath.position.set(0, 0.12, 0);
scene.add(minimapPath);

scene.add(new AmbientLight({ color: "#dbeafe", id: "light.ambient", intensity: 1.0 }));
const sun = new DirectionalLight({ color: "#fff7ed", id: "light.sun", intensity: 3.5 });
sun.position.set(-4, 12, 6);
scene.add(sun);

scene.setActiveCameras([thirdPerson, firstPerson, orbit, minimapCamera]);

const initialMinimap = JSON.stringify({ markers: [{ color: "#f97316", label: "P", radius: 5, x: 0, z: 7 }] });
const pathPoints: [number, number][] = Array.from({ length: 65 }, (_, i) => {
  const a = (i / 64) * Math.PI * 2;
  return [Math.sin(a) * 11, Math.cos(a) * 7];
});

const world = new World()
  .spawn("player.rig", Transform({ position: [0, 0.48, 7], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }), RigState({ progress: 0, yaw: 0 }))
  .spawn("player.nose", Transform({ position: [0, 0.85, 5.9], rotation: [0.7071068, 0, 0, 0.7071068], scale: [1, 1, 1] }))
  .spawn("camera.target.dot", Transform({ position: [0, 1.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }))
  .spawn("camera.firstPerson.rig", Transform({ position: [0, 1.4, 6], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }))
  .spawn("camera.orbit.helper", Transform({ position: [11, 9, 11], rotation: [-0.279848, 0.364705, 0.114219, 0.880476], scale: [1, 1, 1] }))
  .spawn("minimap.player.dot3d", Transform({ position: [0, 0.3, 7], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }))
  .addResource(CameraHud({ mode: "third-person follow | first-person rig | orbit helper | render-layer minimap + UI minimap", progress: 0 }))
  .addResource(MinimapState({ state: initialMinimap }))
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { height: 720, title: "Camera + Minimap Verification", width: 1280 } }));

world.addSystem(
  fixedUpdate("cameraMinimapMotionProbe", {
    commands: [
      commands.setComponent("player.rig", Transform),
      commands.setComponent("player.rig", RigState),
      commands.setComponent("player.nose", Transform),
      commands.setComponent("camera.target.dot", Transform),
      commands.setComponent("camera.firstPerson.rig", Transform),
      commands.setComponent("camera.orbit.helper", Transform),
      commands.setComponent("minimap.player.dot3d", Transform),
    ],
    queries: [defineQuery({ with: [RigState] }), defineQuery({ with: [Transform], without: [RigState] })],
    reads: [RigState, Transform],
    resourceReads: [CameraHud, MinimapState],
    resourceWrites: [CameraHud, MinimapState],
    writes: [RigState, Transform],
    run(context) {
      const rig = context.query({ with: ["RigState"], without: [] })[0];
      if (rig === undefined) return;
      const t = context.time.elapsed;
      const progress = (t * 0.18) % 1;
      const angle = progress * Math.PI * 2;
      const x = Math.sin(angle) * 11;
      const z = Math.cos(angle) * 7;
      const nextAngle = angle + 0.03;
      const nx = Math.sin(nextAngle) * 11;
      const nz = Math.cos(nextAngle) * 7;
      const yaw = Math.atan2(nx - x, nz - z);
      const qy = (value: number): [number, number, number, number] => [0, Math.sin(value / 2), 0, Math.cos(value / 2)];
      const cameraQuat = (pitch: number, heading: number): [number, number, number, number] => {
        const sx = Math.sin(pitch / 2);
        const cx = Math.cos(pitch / 2);
        const sy = Math.sin(heading / 2);
        const cy = Math.cos(heading / 2);
        return [sx * cy, cx * sy, -sx * sy, cx * cy];
      };
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      const px = x;
      const py = 0.48;
      const pz = z;
      rig.patch(RigState, { progress, yaw });
      rig.patch(Transform, { position: [px, py, pz], rotation: qy(yaw), scale: [1, 1, 1] });
      const nose = context.query({ with: ["Transform"], without: ["RigState"] }).find((entity) => entity.id === "player.nose");
      nose?.patch(Transform, { position: [px + forwardX * 0.95, 0.85, pz + forwardZ * 0.95], rotation: cameraQuat(Math.PI / 2, yaw), scale: [1, 1, 1] });
      const target = context.query({ with: ["Transform"], without: ["RigState"] }).find((entity) => entity.id === "camera.target.dot");
      target?.patch(Transform, { position: [px, 1.6, pz], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
      const fp = context.query({ with: ["Transform"], without: ["RigState"] }).find((entity) => entity.id === "camera.firstPerson.rig");
      fp?.patch(Transform, { position: [px + forwardX * 0.25, 1.45, pz + forwardZ * 0.25], rotation: cameraQuat(-0.06, yaw + Math.PI), scale: [1, 1, 1] });
      const orbit = context.query({ with: ["Transform"], without: ["RigState"] }).find((entity) => entity.id === "camera.orbit.helper");
      orbit?.patch(Transform, { position: [px + 11, 9.5, pz + 11], rotation: cameraQuat(-0.62, Math.PI * 0.78), scale: [1, 1, 1] });
      const mapDot = context.query({ with: ["Transform"], without: ["RigState"] }).find((entity) => entity.id === "minimap.player.dot3d");
      mapDot?.patch(Transform, { position: [px, 0.3, pz], rotation: qy(yaw), scale: [1, 1, 1] });
      context.resources.set("CameraHud", { mode: "TP follow + FP rig + orbit helper + minimap", progress: Math.round(progress * 100) });
      context.resources.set("MinimapState", { state: JSON.stringify({ markers: [{ color: "#f97316", label: "P", radius: 5, x: px, z: pz }, { color: "#38bdf8", label: "B", radius: 3, x: -10, z: -5 }, { color: "#ec4899", label: "C", radius: 3, x: 10, z: 4 }] }) });
    },
  }),
);

const ui = Ui({
  id: "camera.verification.hud",
  children: Stack({
    id: "hud.root",
    layout: { height: 720, position: "relative", width: 1280 },
    children: [
      Row({ id: "labels.top", layout: { columnGap: 18, inset: { left: 18, top: 14 }, position: "absolute", zIndex: 8 }, children: [
        Text({ id: "label.tp", text: "TOP LEFT: third-person FOLLOW helper", style: { backgroundColor: "#020617b8", borderColor: "#38bdf8", borderRadius: 10, borderWidth: 1, color: "#e0f2fe", fontSize: 16 } }),
        Text({ id: "label.fp", text: "TOP RIGHT: first-person camera rig", style: { backgroundColor: "#020617b8", borderColor: "#c084fc", borderRadius: 10, borderWidth: 1, color: "#f3e8ff", fontSize: 16 } }),
      ] }),
      Row({ id: "labels.bottom", layout: { columnGap: 18, inset: { bottom: 16, left: 650 }, position: "absolute", zIndex: 8 }, children: [
        Text({ id: "label.orbit", text: "BOTTOM LEFT: ORBIT helper", style: { backgroundColor: "#020617b8", borderColor: "#86efac", borderRadius: 10, borderWidth: 1, color: "#dcfce7", fontSize: 16 } }),
        Text({ id: "label.renderMap", text: "BOTTOM RIGHT: render-layer minimap camera", style: { backgroundColor: "#020617b8", borderColor: "#facc15", borderRadius: 10, borderWidth: 1, color: "#fef9c3", fontSize: 14 } }),
      ] }),
      Column({
        id: "hud.ui.minimap.card",
        layout: { inset: { left: 1038, top: 92 }, padding: 10, position: "absolute", rowGap: 6, width: 218, zIndex: 20 },
        style: { backgroundColor: "#020617f2", borderColor: "#facc15", borderRadius: 14, borderWidth: 2, color: "#e0f2fe" },
        children: [
          Text({ id: "hud.ui.minimap.title", text: "OVERLAY UI MINIMAP", style: { color: "#facc15", fontSize: 13, fontWeight: "bold", textAlign: "center" } }),
          Text({ id: "hud.mode", binding: { kind: "resource", name: "CameraHud", field: "mode" }, style: { color: "#f8fafc", fontSize: 10, textAlign: "center" } }),
          Minimap({
            id: "hud.live.ui.minimap",
            accessibilityLabel: "Live UI minimap verification",
            binding: { kind: "resource", name: "MinimapState", field: "state" },
            layout: { height: 150, width: 196 },
            minimap: {
              backgroundColor: "#111827ff",
              bounds: { minX: -14, maxX: 14, minZ: -10, maxZ: 10 },
              markers: [{ color: "#f97316", label: "P", radius: 5, x: 0, z: 7 }],
              paths: [{ color: "#f8fafc", points: pathPoints, width: 10 }, { color: "#38bdf8", points: pathPoints, width: 5 }],
            },
          }),
          Text({ id: "hud.progress", binding: { kind: "resource", name: "CameraHud", field: "progress" }, style: { color: "#facc15", fontSize: 12, textAlign: "center" } }),
        ],
      }),
    ],
  }),
});

export default { scene, ui, world };
