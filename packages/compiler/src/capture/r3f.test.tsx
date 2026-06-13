import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene as SdkScene } from "@threenative/sdk";

import { captureEntry } from "../capture.js";
import { CompilerError } from "../errors.js";
import { sceneToWorld } from "../emit/scene-to-world.js";

test("r3f should emit same ir as sdk scene", async () => {
  const root = await makeProject(`/** @jsxImportSource @threenative/r3f */
import { BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "@threenative/r3f";

export default (
  <Scene id="scene">
    <Mesh id="cube" position={[1, 2, 3]}>
      <BoxGeometry size={[2, 2, 2]} />
      <MeshStandardMaterial color="#2f80ed" roughness={0.5} />
    </Mesh>
    <PerspectiveCamera id="camera" position={[0, 2, 5]} />
    <DirectionalLight id="sun" intensity={2} />
  </Scene>
);
`);
  try {
    const captured = await captureEntry(makeConfig(root));

    assert.equal(captured.summary.rootType, "Scene");
    assert.deepEqual(sceneToWorld(captured.root as SdkScene), sceneToWorld(makeSdkScene()));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("r3f should reject drei helper", async () => {
  const root = await makeProject(`import { OrbitControls } from "@react-three/drei";
void OrbitControls;
export default {};
`);
  try {
    await assert.rejects(
      () => captureEntry(makeConfig(root)),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_R3F_UNSUPPORTED_JSX" &&
        error.diagnostic?.suggestion?.includes("@threenative/r3f") === true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("r3f should reject browser api in scene capture", async () => {
  const root = await makeProject(`/** @jsxImportSource @threenative/r3f */
import { Scene } from "@threenative/r3f";

const title = window.location.href;
export default <Scene id={title} />;
`);
  try {
    await assert.rejects(
      () => captureEntry(makeConfig(root)),
      (error: unknown) =>
        error instanceof CompilerError &&
        error.code === "TN_COMPILER_R3F_BROWSER_API" &&
        error.diagnostic?.path === "src/game.tsx",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeSdkScene(): SdkScene {
  const scene = new SdkScene({ id: "scene" });
  const cube = new Mesh({
    geometry: new BoxGeometry({ size: [2, 2, 2] }),
    id: "cube",
    material: new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.5 }),
  });
  cube.position.set(1, 2, 3);
  const camera = new PerspectiveCamera({ far: 100, fovY: 60, id: "camera", near: 0.1 });
  camera.position.set(0, 2, 5);
  scene.add(cube);
  scene.add(camera);
  scene.add(new DirectionalLight({ id: "sun", intensity: 2 }));
  scene.setActiveCamera(camera);
  return scene;
}

async function makeProject(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-r3f-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/game.tsx"), source);
  return root;
}

function makeConfig(root: string) {
  return {
    entry: "src/game.tsx",
    outDir: "dist/game.bundle",
    projectPath: root,
    schema: "threenative.project" as const,
    version: "0.1.0" as const,
  };
}
