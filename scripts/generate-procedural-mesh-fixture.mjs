import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildOrganicMeshHelper, organicMeshFixtureEnrollments } from "../packages/sdk/dist/index.js";

const root = resolve("packages/ir/fixtures/conformance/procedural-mesh/game.bundle");
const generated = resolve(root, "generated/meshes");
await rm(generated, { recursive: true, force: true });
await mkdir(generated, { recursive: true });
const helpers = organicMeshFixtureEnrollments.filter((entry) => entry.visual).map((entry) => entry.helper);
const assets = [];
for (const helper of helpers) {
  const geometry = buildOrganicMeshHelper(helper, { seed: 12 });
  const id = `mesh.${geometry.generation.id}`;
  const binaryAttributes = [];
  for (const [ordinal, attribute] of geometry.attributes.entries()) {
    const path = `generated/meshes/${id}.${String(ordinal).padStart(2, "0")}.${attribute.name}.bin`;
    await writeFile(resolve(root, path), Buffer.from(new Float32Array(attribute.values).buffer));
    binaryAttributes.push({ count: attribute.values.length / attribute.itemSize, format: `float32x${attribute.itemSize}`, itemSize: attribute.itemSize, name: attribute.name, path });
  }
  const indexFormat = geometry.attributes.find((entry) => entry.name === "position").values.length / 3 > 65535 ? "uint32" : "uint16";
  const IndexArray = indexFormat === "uint32" ? Uint32Array : Uint16Array;
  const indexPath = `generated/meshes/${id}.indices.${indexFormat}.bin`;
  await writeFile(resolve(root, indexPath), Buffer.from(new IndexArray(geometry.indices).buffer));
  assets.push({ binaryAttributes, binaryIndices: { count: geometry.indices.length, format: indexFormat, path: indexPath }, bounds: geometry.bounds, budget: geometry.budget, format: "generated", generation: geometry.generation, id, kind: "mesh", primitive: "custom", topology: geometry.topology, usage: geometry.usage, derivedCollider: geometry.collider });
}
const json = (file, value) => writeFile(resolve(root, file), `${JSON.stringify(value, null, 2)}\n`);
await json("input.ir.json", {
  actions: [],
  axes: [
    { id: "StandX", negative: [{ code: "KeyA", device: "keyboard" }], positive: [{ code: "KeyD", device: "keyboard" }] },
    { id: "StandZ", negative: [{ code: "KeyS", device: "keyboard" }], positive: [{ code: "KeyW", device: "keyboard" }] },
  ],
  schema: "threenative.input",
  version: "0.1.0",
});
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
await json("manifest.json", { ...manifest, files: { ...manifest.files, input: "input.ir.json" } });
await json("assets.manifest.json", { assets: assets.map(({ derivedCollider: _, ...asset }) => asset), schema: "threenative.assets", version: "0.1.0" });
const colors = { pineTree: "#7fb069", bush: "#4f8f4c", arch: "#b4a58e" };
await json("materials.ir.json", { materials: helpers.map((helper) => ({ color: "#000000", emissive: colors[helper], emissiveIntensity: 1, id: `mat.${helper}`, kind: "standard", metalness: 0, roughness: 1 })), schema: "threenative.materials", version: "0.1.0" });
const entities = helpers.map((helper, index) => {
  const asset = assets[index];
  const components = { MeshRenderer: { material: `mat.${helper}`, mesh: asset.id }, Transform: { position: [(index - 1) * 3, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } };
  if (asset.derivedCollider) {
    const collider = asset.derivedCollider.kind === "mesh"
      ? { ...asset.derivedCollider, mesh: { ...asset.derivedCollider.mesh, source: asset.id } }
      : asset.derivedCollider;
    Object.assign(components, { Collider: { ...collider, layer: "world" }, RigidBody: { kind: "static" } });
  }
  return { components, id: `prop.${helper}` };
});
const proofEntities = [
  {
    components: {
      CharacterController: { blocking: true, grounding: "raycast", moveXAxis: "StandX", moveZAxis: "StandZ", speed: 1, stepOffset: 0.3 },
      Collider: { height: 1.6, kind: "capsule", layer: "player", mask: ["world"], radius: 0.3 },
      RigidBody: { kind: "kinematic" },
      Transform: { position: [3, 2.9, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    },
    id: "proof.character-on-arch",
  },
  {
    components: {
      Collider: { friction: 1, kind: "box", layer: "dynamic", mask: ["world"], size: [0.5, 0.5, 0.5] },
      RigidBody: { ccd: { enabled: true, mode: "swept-aabb" }, damping: 0.2, kind: "dynamic", mass: 1, velocity: [0, 0, 0] },
      Transform: { position: [0, 2.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    },
    id: "proof.box-on-bush",
  },
];
await json("world.ir.json", { entities: [...entities, ...proofEntities, { components: { Camera: { kind: "perspective", far: 100, fovY: 45, near: 0.1, priority: 0 }, Transform: { position: [0, 1.2, 8], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } }, id: "camera.procedural" }, { components: { Light: { color: "#ffffff", intensity: 1.5, kind: "ambient" } }, id: "light.ambient" }, { components: { Light: { color: "#ffffff", intensity: 2, kind: "directional" }, Transform: { position: [3, 6, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } }, id: "light.key" }], resources: { ActiveCamera: { entity: "camera.procedural" } }, schema: "threenative.world", version: "0.1.0" });
