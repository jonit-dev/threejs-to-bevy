import assert from "node:assert/strict";
import test from "node:test";
import {
  AnnulusGeometry,
  ConicalFrustumGeometry,
  CustomMeshGeometry,
  ExtrudedRectangleGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RegularPolygonGeometry,
  Scene,
  TorusGeometry,
} from "@threenative/sdk";

import { sceneToWorld } from "./scene-to-world.js";

test("should preserve parent child hierarchy", () => {
  const scene = new Scene({ id: "scene" });
  const parent = new Object3D({ id: "parent" });
  const child = new Object3D({ id: "child" });
  parent.add(child);
  scene.add(parent);

  const result = sceneToWorld(scene);
  const childEntity = result.world.entities.find((entity) => entity.id === "child");

  assert.deepEqual(childEntity?.components.Hierarchy, { parent: "parent" });
});

test("should emit deterministic size tuples for expanded primitive catalog", () => {
  const scene = new Scene({ id: "scene" });
  const material = new MeshStandardMaterial({ color: "#ffffff" });
  scene.add(new Mesh({ geometry: new ConicalFrustumGeometry({ radiusTop: 0.2, radiusBottom: 0.7, height: 1.5 }), id: "frustum", material }));
  scene.add(new Mesh({ geometry: new TorusGeometry({ innerRadius: 0.25, outerRadius: 0.75 }), id: "torus", material }));
  scene.add(new Mesh({ geometry: new AnnulusGeometry({ innerRadius: 0.3, outerRadius: 0.8 }), id: "annulus", material }));
  scene.add(new Mesh({ geometry: new RegularPolygonGeometry({ radius: 0.9, sides: 5 }), id: "polygon", material }));
  scene.add(new Mesh({ geometry: new ExtrudedRectangleGeometry({ depth: 0.4, size: [2, 3] }), id: "extruded", material }));

  const result = sceneToWorld(scene);

  assert.deepEqual(
    result.assets.map((asset) => [asset.id, asset.primitive, asset.size]),
    [
      ["mesh.annulus", "annulus", [0.3, 0.8]],
      ["mesh.extruded", "extrudedRectangle", [2, 3, 0.4]],
      ["mesh.frustum", "conicalFrustum", [0.2, 0.7, 1.5]],
      ["mesh.polygon", "regularPolygon", [0.9, 5]],
      ["mesh.torus", "torus", [0.25, 0.75]],
    ],
  );
});

test("should emit custom mesh attributes and indices", () => {
  const scene = new Scene({ id: "scene" });
  const material = new MeshStandardMaterial({ color: "#ffffff" });
  scene.add(
    new Mesh({
      geometry: new CustomMeshGeometry({
        attributes: [
          { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
          { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
          { itemSize: 1, name: "custom:weight", values: [0, 0.5, 1] },
        ],
        indices: [0, 1, 2],
      }),
      id: "custom",
      material,
    }),
  );

  const result = sceneToWorld(scene);

  assert.deepEqual(result.assets[0], {
    attributes: [
      { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
      { itemSize: 1, name: "custom:weight", values: [0, 0.5, 1] },
      { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
    ],
    id: "mesh.custom",
    indices: [0, 1, 2],
    kind: "mesh",
    format: "generated",
    primitive: "custom",
  });
});

test("should emit material alpha metadata", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new CustomMeshGeometry({
        attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
        indices: [0, 1, 2],
      }),
      id: "transparent",
      material: new MeshStandardMaterial({ alphaCutoff: 0.4, alphaMode: "mask", color: "#ffffff", emissive: "#33ccff", emissiveIntensity: 2.5, opacity: 0.65 }),
    }),
  );

  const result = sceneToWorld(scene);

  assert.equal(result.materials[0]?.alphaMode, "mask");
  assert.equal(result.materials[0]?.alphaCutoff, 0.4);
  assert.equal(result.materials[0]?.emissive, "#33ccff");
  assert.equal(result.materials[0]?.emissiveIntensity, 2.5);
  assert.equal(result.materials[0]?.opacity, 0.65);
});

test("should emit mesh shadow controls", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      castShadow: false,
      geometry: new CustomMeshGeometry({
        attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
        indices: [0, 1, 2],
      }),
      id: "decor",
      material: new MeshStandardMaterial({ color: "#ffffff" }),
      receiveShadow: true,
    }),
  );

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "decor");

  assert.deepEqual(entity?.components.MeshRenderer, {
    castShadow: false,
    material: "mat.decor",
    mesh: "mesh.decor",
    receiveShadow: true,
  });
});
