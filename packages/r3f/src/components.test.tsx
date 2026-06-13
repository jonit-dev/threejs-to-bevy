import assert from "node:assert/strict";
import test from "node:test";

import { BoxGeometry, captureScene, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "./index.js";

test("should capture mesh hierarchy from jsx", () => {
  const scene = captureScene(
    <Scene id="scene">
      <Mesh id="cube" position={[1, 2, 3]}>
        <BoxGeometry size={[2, 2, 2]} />
        <MeshStandardMaterial color="#2f80ed" />
      </Mesh>
      <PerspectiveCamera id="camera" position={[0, 2, 5]} />
      <DirectionalLight id="sun" intensity={2} />
    </Scene>,
  );

  assert.equal(scene.constructor.name, "Scene");
  assert.deepEqual(
    scene.children.map((child) => child.id),
    ["cube", "camera", "sun"],
  );
  assert.equal(scene.activeCamera?.id, "camera");
});

test("should preserve explicit entity ids", () => {
  const first = captureScene(
    <Scene id="scene">
      <Mesh id="player">
        <BoxGeometry />
        <MeshStandardMaterial />
      </Mesh>
    </Scene>,
  );
  const second = captureScene(
    <Scene id="scene">
      <Mesh id="player">
        <BoxGeometry />
        <MeshStandardMaterial />
      </Mesh>
    </Scene>,
  );

  assert.equal(first.children[0]?.id, "player");
  assert.equal(second.children[0]?.id, "player");
});
