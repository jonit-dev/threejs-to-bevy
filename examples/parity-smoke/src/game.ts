import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from "@threenative/sdk";

const scene = new Scene({ id: "parity-smoke.scene" });

const floor = new Mesh({
  geometry: new PlaneGeometry({ size: [22, 36] }),
  id: "floor",
  material: new MeshStandardMaterial({ color: "#2a2f3a", roughness: 1 }),
});
floor.position.set(0, -0.5, -8);
floor.rotation.set(-Math.PI / 2, 0, 0);
scene.add(floor);

// Near hero — standard PBR response (v1-canonical baseline)
const player = new Mesh({
  geometry: new BoxGeometry({ size: [1, 1.4, 1] }),
  id: "hero.player",
  material: new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.85 }),
});
player.position.set(0, 0.2, 0);
scene.add(player);

const marker = new Mesh({
  geometry: new SphereGeometry({ radius: 0.35 }),
  id: "hero.marker",
  material: new MeshStandardMaterial({ color: "#ffb020", roughness: 0.7 }),
});
marker.position.set(1.35, -0.05, -0.55);
scene.add(marker);

// Metal/rough PBR card
const metalCard = new Mesh({
  geometry: new BoxGeometry({ size: [0.75, 0.75, 0.12] }),
  id: "card.metal-rough",
  material: new MeshStandardMaterial({ color: "#d4d7dc", metalness: 0.92, roughness: 0.22 }),
});
metalCard.position.set(2.15, 0.55, -0.35);
scene.add(metalCard);

// Dark rough pad — ambient fill / underexposure guard
const track = new Mesh({
  geometry: new BoxGeometry({ size: [1.5, 0.08, 1.2] }),
  id: "pad.dark-rough",
  material: new MeshStandardMaterial({ color: "#273447", roughness: 0.92 }),
});
track.position.set(-2.55, -0.46, 0.1);
scene.add(track);

// Emissive color probes (display-referred color pipeline)
const probeColors = ["#e6194b", "#4363d8", "#ffffff"] as const;
for (const [index, color] of probeColors.entries()) {
  const probe = new Mesh({
    geometry: new BoxGeometry({ size: [0.4, 0.4, 0.4] }),
    id: `probe.color.${index}`,
    material: new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1,
      metalness: 0,
      roughness: 1,
    }),
  });
  probe.position.set((index - 1) * 0.82, 1.05, -1.15);
  scene.add(probe);
}

// Fog depth markers — same albedo, different distance so fog attenuation is visible
const midFog = new Mesh({
  geometry: new BoxGeometry({ size: [1.35, 1.35, 1.35] }),
  id: "fog.mid",
  material: new MeshStandardMaterial({ color: "#d8742f", roughness: 0.88 }),
});
midFog.position.set(0, 0.68, -8);
scene.add(midFog);

const farFog = new Mesh({
  geometry: new BoxGeometry({ size: [1.55, 1.55, 1.55] }),
  id: "fog.far",
  material: new MeshStandardMaterial({ color: "#2457d6", roughness: 0.9 }),
});
farFog.position.set(0, 0.78, -15);
scene.add(farFog);

const camera = new PerspectiveCamera({ far: 90, fovY: 52, id: "camera.main", near: 0.1 });
camera.position.set(0, 2.35, 6.2);
camera.rotation.set(-0.11, 0, 0);
scene.add(camera);
scene.setActiveCamera(camera);

export default {
  scene,
  environment: {
    assetNames: [],
    instances: [],
    path: {
      id: "path.parity-smoke",
      points: [
        [0, 0, 2],
        [0, 0, -18],
      ],
      width: 2,
    },
    sourceAssets: [],
    sourceDir: "src",
    atmosphere: {
      active: true,
      id: "atmosphere.parity-smoke",
      ambient: { color: "#ffffff", intensity: 0.85, mode: "constant" },
      colorManagement: {
        exposure: 1,
        outputColorSpace: "srgb",
        textureColorSpace: "srgb",
        toneMapping: "none",
      },
      fog: {
        color: "#c9d6c7",
        density: 0.085,
        enabled: true,
        mode: "exponential",
      },
      shadows: {
        bias: -0.0004,
        cascadeCount: 1,
        enabled: false,
        mapSize: 512,
        maxDistance: 30,
        normalBias: 0.02,
        receiverPolicy: "terrain-and-path",
      },
      sky: { color: "#6aaed6", horizonColor: "#c9d6c7" },
      sun: {
        castsShadow: false,
        color: "#fff1c7",
        direction: [-0.42, -0.78, -0.28],
        id: "sun.parity-smoke",
        intensity: 1.4,
      },
    },
  },
};
