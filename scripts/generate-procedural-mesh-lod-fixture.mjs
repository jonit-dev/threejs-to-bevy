import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emitBundle } from "../packages/compiler/dist/index.js";
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshBuilder,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "../packages/sdk/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = resolve(repoRoot, "packages/ir/fixtures/conformance/procedural-mesh-lod/game.bundle");
const environmentSourceDir = resolve(repoRoot, "packages/ir/fixtures/conformance/procedural-mesh-lod/.environment-source");
const entityPosition = [1.25, -0.5, 0.75];

await mkdir(environmentSourceDir, { recursive: true });
try {
  const geometry = MeshBuilder.create("proof.asymmetric-key")
    .position([0, 0.45, 0])
    .color("#5de0d2")
    .torus({ majorRadius: 1.05, minorRadius: 0.28, radialSegments: 28, tubularSegments: 44 })
    .position([1.3, -0.55, 0])
    .rotate([0, 0, -0.52])
    .color("#5de0d2")
    .roundedBox({ cornerRadius: 0.12, cornerSegments: 4, size: [2.35, 0.48, 0.58] })
    .position([2.25, -1.22, 0])
    .rotate([0, 0, -0.52])
    .color("#5de0d2")
    .prism({ height: 0.62, radius: 0.42, sides: 5 })
    .weld({ tolerance: 1e-6 })
    .smoothNormals()
    .build({
      budget: "hero-prop",
      collider: "box",
      helper: "generatedMeshLodProof",
      lodLevels: [
        { minDistance: 40, ratio: 0.5 },
        { minDistance: 80, ratio: 0.25 },
      ],
      seed: 23,
      storage: "binary",
    });

  const thresholds = geometry.lodLevels?.map((level) => level.minDistance) ?? [];
  if (thresholds.length !== 2) {
    throw new Error(`Expected two generated LOD thresholds, received ${thresholds.length}.`);
  }
  const [threshold1, threshold2] = thresholds;
  const epsilon = Math.max(0.01, threshold1 * 0.01);
  const bookmarks = [
    bookmark("lod.near", threshold1 - epsilon),
    bookmark("lod.threshold.1", threshold1),
    bookmark("lod.threshold.2", threshold2),
    bookmark("lod.far", threshold2 + Math.max(1, threshold2 * 0.15)),
  ];

  const scene = new Scene({ id: "scene.procedural-mesh-lod" });
  const mesh = new Mesh({
    castShadow: true,
    geometry,
    id: "proof.generated-mesh-lod",
    layers: ["lod-proof", "world"],
    material: new MeshStandardMaterial({
      color: "#163a40",
      emissive: "#2fb8aa",
      emissiveIntensity: 0.7,
      metalness: 0.05,
      roughness: 0.7,
    }),
    receiveShadow: true,
    visible: true,
  });
  mesh.setPosition(...entityPosition).setScale(3.3, 2.7, 3);

  const camera = new PerspectiveCamera({
    far: 300,
    fovY: 62,
    id: "camera.procedural-mesh-lod",
    layers: ["lod-proof", "world"],
    near: 0.1,
  });
  camera.setPosition(...cameraPosition(bookmarks[0].position[2] - entityPosition[2]));
  const keyLight = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 2 });
  keyLight.setPosition(4, 7, 6);
  scene.add(mesh).add(camera).add(new AmbientLight({ color: "#8adad2", id: "light.ambient", intensity: 1.2 })).add(keyLight);
  scene.setActiveCamera(camera);

  await emitBundle(
    {
      entry: "scripts/generate-procedural-mesh-lod-fixture.mjs",
      outDir: relative(repoRoot, fixtureDir),
      projectPath: repoRoot,
      schema: "threenative.project",
      version: "0.1.0",
    },
    {
      environment: {
        assetNames: [],
        bookmarks,
        instances: [],
        path: { id: "path.lod-proof", points: [[0, 0, 0], [0, 0, 1]], width: 1 },
        sourceDir: relative(repoRoot, environmentSourceDir),
      },
      scene,
    },
  );

  const world = JSON.parse(await readFile(resolve(fixtureDir, "world.ir.json"), "utf8"));
  const assets = JSON.parse(await readFile(resolve(fixtureDir, "assets.manifest.json"), "utf8"));
  const renderer = world.entities.find((entity) => entity.id === "proof.generated-mesh-lod")?.components?.MeshRenderer;
  const triangleCounts = [renderer?.mesh, ...(renderer?.lod?.levels ?? []).map((level) => level.mesh)].map((meshId) => {
    const asset = assets.assets.find((candidate) => candidate.id === meshId);
    return (asset?.binaryIndices?.count ?? asset?.indices?.length ?? 0) / 3;
  });
  if (!(triangleCounts[0] > triangleCounts[1] && triangleCounts[1] > triangleCounts[2])) {
    throw new Error(`Expected strictly decreasing triangle counts, received ${triangleCounts.join(", ")}.`);
  }

  process.stdout.write(`${JSON.stringify({ bundlePath: relative(repoRoot, fixtureDir), thresholds, triangleCounts }, null, 2)}\n`);
} finally {
  await rm(environmentSourceDir, { force: true, recursive: true });
}

function bookmark(id, distance) {
  return {
    id,
    pitch: 0,
    position: cameraPosition(distance),
    yaw: 180,
  };
}

function cameraPosition(distance) {
  return [entityPosition[0], entityPosition[1], entityPosition[2] + distance];
}
