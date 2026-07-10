import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { IAtmosphereProfileIr } from "@threenative/ir";

import {
  DirectionalShadowController,
  shouldUseDirectionalShadowController,
} from "./directionalShadowController.js";

function atmosphere(overrides: Partial<IAtmosphereProfileIr["shadows"]> = {}): IAtmosphereProfileIr {
  return {
    active: true,
    ambient: { color: "#8899aa", intensity: 0.4, mode: "constant" },
    colorManagement: { exposure: 1, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
    id: "atmosphere.test",
    shadows: {
      bias: -0.0005,
      cascadeBlendFraction: 0.07,
      cascadeCount: 2,
      enabled: true,
      mapSize: 1024,
      maxDistance: 80,
      normalBias: 0.02,
      receiverPolicy: "terrain-and-path",
      splitLambda: 0.35,
      splitScheme: "practical",
      stabilized: true,
      ...overrides,
    },
    sky: { color: "#99bbdd" },
    sun: { castsShadow: true, color: [1, 0.8, 0.6], direction: [-0.4, -0.8, -0.2], id: "sun.test", intensity: 2.5 },
  };
}

function camera(): THREE.PerspectiveCamera {
  const result = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
  result.position.set(0, 2, 8);
  result.lookAt(0, 1, 0);
  result.updateProjectionMatrix();
  result.updateMatrixWorld(true);
  return result;
}

test("DirectionalShadowController should own cascade lights and report the exact resolved profile", () => {
  const scene = new THREE.Scene();
  const legacy = new THREE.DirectionalLight();
  legacy.name = "sun.test";
  scene.add(legacy, legacy.target);
  const controller = new DirectionalShadowController({ atmosphere: atmosphere(), camera: camera(), scene });

  assert.equal(controller.lights.length, 2);
  assert.equal(scene.children.includes(legacy), false);
  assert.equal(scene.children.includes(legacy.target), false);
  assert.equal(controller.lights.every((light) => light.userData.threeNativeOwnedDirectionalShadow === true), true);
  assert.equal(controller.lights.every((light) => scene.children.includes(light) && scene.children.includes(light.target)), true);
  assert.deepEqual(controller.report(), {
    applied: {
      cascadeBlendFraction: 0.07,
      cascadeCount: 2,
      maxDistance: 80,
      splitLambda: 0.35,
      splitScheme: "practical",
      stabilized: true,
    },
    mode: "exact",
    requested: {
      cascadeBlendFraction: 0.07,
      cascadeCount: 2,
      maxDistance: 80,
      splitLambda: 0.35,
      splitScheme: "practical",
      stabilized: true,
    },
  });

  controller.dispose();
  assert.equal(controller.lights.some((light) => scene.children.includes(light) || scene.children.includes(light.target)), false);
});

test("DirectionalShadowController should compose and restore authored material hooks", () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const authoredDefines = { ...(material as THREE.Material & { defines?: Record<string, unknown> }).defines };
  const authoredCompileHook: THREE.Material["onBeforeCompile"] = (shader) => {
    shader.uniforms.authoredUniform = { value: 42 };
  };
  const authoredCacheKey = () => "authored-program-key";
  material.onBeforeCompile = authoredCompileHook;
  material.customProgramCacheKey = authoredCacheKey;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

  const controller = new DirectionalShadowController({ atmosphere: atmosphere(), camera: camera(), scene });
  assert.notEqual(material.onBeforeCompile, authoredCompileHook);
  assert.match(material.customProgramCacheKey(), /^authored-program-key:tn-csm-2-0\.07$/);

  const shader = {
    fragmentShader: "#include <lights_pars_begin>\nvoid main() {\n#include <lights_fragment_begin>\n}",
    uniforms: {},
    vertexShader: "void main() {}",
  } as unknown as Parameters<THREE.Material["onBeforeCompile"]>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.equal(shader.uniforms.authoredUniform?.value, 42);
  assert.equal(shader.uniforms.csmCascadeBlendFraction?.value, 0.07);
  assert.equal(shader.uniforms.CSM_cascades?.value.length, 2);
  assert.equal(shader.uniforms.CSM_cascades?.value.every((entry: unknown) => entry instanceof THREE.Vector2), true);
  const compiledCascades = shader.uniforms.CSM_cascades?.value as THREE.Vector2[];
  assert.equal(compiledCascades[0]?.x, 0);
  assert.ok((compiledCascades[0]?.y ?? 0) > 0 && (compiledCascades[0]?.y ?? 1) < 1);
  assert.equal(compiledCascades[1]?.x, compiledCascades[0]?.y);
  assert.equal(compiledCascades[1]?.y, 1);
  const compiledBlendMargins = shader.uniforms.CSM_blendMargins?.value as THREE.Vector2[];
  assert.equal(compiledBlendMargins.length, 2);
  assert.equal(compiledBlendMargins[0]?.y, compiledBlendMargins[1]?.x);
  assert.ok((compiledBlendMargins[0]?.y ?? 0) > 0);
  assert.equal(shader.fragmentShader.includes("#include <lights_fragment_begin>"), false);
  assert.match(shader.fragmentShader, /CSM_blendMargins\[ i \]\.x : CSM_blendMargins\[ i \]\.y/);

  controller.dispose();
  assert.equal(material.onBeforeCompile, authoredCompileHook);
  assert.equal(material.customProgramCacheKey, authoredCacheKey);
  assert.deepEqual((material as THREE.Material & { defines?: Record<string, unknown> }).defines, authoredDefines);
});

test("DirectionalShadowController should keep light matrices stable below a texel and move them with the camera", () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  const activeCamera = camera();
  const profile = atmosphere();
  const controller = new DirectionalShadowController({ atmosphere: profile, camera: activeCamera, scene });
  const initial = controller.snapshot();
  const firstCascade = initial.cascades[0]!;
  const texelWidth = (firstCascade.right * 2) / profile.shadows.mapSize;
  const lightDirection = new THREE.Vector3(...profile.sun.direction).normalize();
  const up = Math.abs(lightDirection.dot(new THREE.Vector3(0, 1, 0))) > 0.99
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const lightOrientation = new THREE.Matrix4().lookAt(new THREE.Vector3(), lightDirection, up);
  const lightSpaceXInWorld = new THREE.Vector3().setFromMatrixColumn(lightOrientation, 0).normalize();

  activeCamera.position.addScaledVector(lightSpaceXInWorld, texelWidth * 0.1);
  activeCamera.updateMatrixWorld(true);
  controller.update(activeCamera);
  assert.deepEqual(controller.snapshot().cascades.map((cascade) => cascade.lightMatrix), initial.cascades.map((cascade) => cascade.lightMatrix));

  activeCamera.position.addScaledVector(lightSpaceXInWorld, texelWidth * 1.1);
  activeCamera.updateMatrixWorld(true);
  controller.update(activeCamera);
  assert.notDeepEqual(controller.snapshot().cascades.map((cascade) => cascade.lightMatrix), initial.cascades.map((cascade) => cascade.lightMatrix));
  assert.equal(controller.lights.every((light) => Math.abs(light.shadow.bias) <= 0.0005 && light.shadow.normalBias <= 0.02), true);
  controller.dispose();
});

test("should retain legacy single-light behavior until a cascade profile is enrolled", () => {
  const legacy = atmosphere({
    cascadeBlendFraction: undefined,
    splitLambda: undefined,
    splitScheme: undefined,
    stabilized: undefined,
  });
  assert.equal(shouldUseDirectionalShadowController(legacy, { rendering: [] }), false);
  assert.equal(shouldUseDirectionalShadowController(legacy, { rendering: ["shadow-cascade-profile"] }), true);
  assert.equal(
    shouldUseDirectionalShadowController(
      legacy,
      { rendering: ["shadow-cascade-profile"] },
      { enabled: false },
    ),
    false,
  );
});

test("DirectionalShadowController should fit and snap with the applied render-look map size", () => {
  const scene = new THREE.Scene();
  const authored = atmosphere({ mapSize: 2048 });
  const controller = new DirectionalShadowController({
    atmosphere: authored,
    camera: camera(),
    renderLookShadowProfile: { enabled: true, mapSize: 512 },
    scene,
  });

  assert.equal(controller.lights.every((light) => light.shadow.mapSize.width === 512 && light.shadow.mapSize.height === 512), true);
  const firstCascade = controller.snapshot().cascades[0]!;
  const appliedTexelWidth = (firstCascade.right * 2) / controller.lights[0]!.shadow.mapSize.width;
  const incorrectlyAuthoredTexelWidth = (firstCascade.right * 2) / authored.shadows.mapSize;
  assert.equal(appliedTexelWidth, incorrectlyAuthoredTexelWidth * 4);
  controller.dispose();
});

test("DirectionalShadowController should expand fitted coverage for blending without moving split centers", () => {
  const blendedScene = new THREE.Scene();
  const sharpScene = new THREE.Scene();
  const blended = new DirectionalShadowController({
    atmosphere: atmosphere({ cascadeBlendFraction: 0.1 }),
    camera: camera(),
    scene: blendedScene,
  });
  const sharp = new DirectionalShadowController({
    atmosphere: atmosphere({ cascadeBlendFraction: 0 }),
    camera: camera(),
    scene: sharpScene,
  });
  const blendedSnapshot = blended.snapshot();
  const sharpSnapshot = sharp.snapshot();

  assert.deepEqual(
    blendedSnapshot.cascades.map((cascade) => cascade.splitDistance),
    sharpSnapshot.cascades.map((cascade) => cascade.splitDistance),
  );
  assert.ok(blendedSnapshot.cascades[0]!.right > sharpSnapshot.cascades[0]!.right);
  assert.ok(blendedSnapshot.cascades[1]!.right > sharpSnapshot.cascades[1]!.right);
  blended.dispose();
  sharp.dispose();
});
