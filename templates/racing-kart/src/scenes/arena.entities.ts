import { AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene } from "@threenative/sdk";

export const arenaVisualScene = new Scene({ id: "scene.racing-kart" });

const asphalt = new MeshStandardMaterial({ color: "#29313a", roughness: 0.88 });
const grass = new MeshStandardMaterial({ color: "#2f6f45", roughness: 0.8 });
const lanePaint = new MeshStandardMaterial({ color: "#f4f0dc", roughness: 0.45 });
const curbRed = new MeshStandardMaterial({ color: "#c44536", roughness: 0.55 });
const curbWhite = new MeshStandardMaterial({ color: "#f7f4e8", roughness: 0.5 });
const playerBlue = new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.5 });
const rivalRed = new MeshStandardMaterial({ color: "#d94343", roughness: 0.52 });
const rivalYellow = new MeshStandardMaterial({ color: "#f2c94c", roughness: 0.48 });
const rivalGreen = new MeshStandardMaterial({ color: "#27ae60", roughness: 0.52 });
const tire = new MeshStandardMaterial({ color: "#16191f", roughness: 0.72 });
const glass = new MeshStandardMaterial({ color: "#91d7ff", roughness: 0.22 });

const ground = new Mesh({
  geometry: new PlaneGeometry({ size: [24, 26] }),
  id: "track.infield",
  material: grass,
});
ground.setPosition(0, -0.08, -2).setRotation(-Math.PI / 2, 0, 0);
arenaVisualScene.add(ground);

for (const segment of [
  { id: "straight.start", position: [0, 0, 2.4], scale: [6.8, 0.08, 8.4] },
  { id: "curve.left.entry", position: [-3.2, 0, -2.3], scale: [4.6, 0.08, 3.4] },
  { id: "curve.left.apex", position: [-1.8, 0, -5.1], scale: [5.6, 0.08, 3.0] },
  { id: "curve.left.exit", position: [2.2, 0, -5.4], scale: [5.2, 0.08, 3.2] },
] as const) {
  arenaVisualScene.add(box(`track.${segment.id}`, asphalt, segment.position, segment.scale));
}

for (const [index, x] of [-2.4, 0, 2.4].entries()) {
  arenaVisualScene.add(box(`track.grid.line.${index}`, lanePaint, [x, 0.055, 5.95], [0.12, 0.04, 1.4]));
}

for (let index = 0; index < 10; index += 1) {
  const x = -4.9 + index * 0.95;
  const z = -6.85 + Math.sin(index / 2.2) * 0.45;
  arenaVisualScene.add(box(`track.curve.marker.${index}`, index % 2 === 0 ? curbRed : curbWhite, [x, 0.08, z], [0.58, 0.1, 0.42]));
}

for (let index = 0; index < 5; index += 1) {
  arenaVisualScene.add(box(`track.center-dash.${index}`, lanePaint, [0, 0.06, 3.6 - index * 1.9], [0.14, 0.04, 0.8]));
}

addKart("kart.player", playerBlue, [0, 0.34, 4.4], 0);
addKart("kart.rival.red", rivalRed, [-1.9, 0.34, 1.2], 0.08);
addKart("kart.rival.yellow", rivalYellow, [1.7, 0.34, -1.0], -0.18);
addKart("kart.rival.green", rivalGreen, [-2.7, 0.34, -3.7], 0.42);

const camera = new PerspectiveCamera({
  far: 120,
  follow: { offset: [0, 3.4, 6.2], smoothing: 8, target: "kart.player" },
  fovY: 54,
  id: "camera.chase",
  near: 0.1,
});
camera.setPosition(0, 3.4, 10.6).setRotation(-0.46, 0, 0);
arenaVisualScene.add(camera);
arenaVisualScene.setActiveCamera(camera);

const keyLight = new DirectionalLight({ color: "#fff4dc", id: "light.key", intensity: 2.6 });
keyLight.setPosition(4, 7, 5);
arenaVisualScene.add(keyLight);
arenaVisualScene.add(new AmbientLight({ color: "#dce8ff", id: "light.ambient", intensity: 0.65 }));

function addKart(id: string, material: MeshStandardMaterial, position: readonly [number, number, number], yaw: number): void {
  const body = box(id, material, position, [1.2, 0.32, 1.8]);
  body.setRotation(0, yaw, 0);
  body.add(box(`${id}.cockpit`, glass, [0, 0.34, -0.15], [0.62, 0.34, 0.68]));
  body.add(box(`${id}.nose`, material, [0, 0.05, -0.72], [0.82, 0.18, 0.42]));
  for (const [suffix, x, z] of [
    ["front-left", -0.68, -0.55],
    ["front-right", 0.68, -0.55],
    ["rear-left", -0.68, 0.55],
    ["rear-right", 0.68, 0.55],
  ] as const) {
    body.add(box(`${id}.wheel.${suffix}`, tire, [x, -0.16, z], [0.24, 0.28, 0.38]));
  }
  arenaVisualScene.add(body);
}

function box(id: string, material: MeshStandardMaterial, position: readonly [number, number, number], scale: readonly [number, number, number]): Mesh {
  return new Mesh({
    geometry: new BoxGeometry({ size: [1, 1, 1] }),
    id,
    material,
  }).patchTransform({ position, scale });
}
