import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { IWorldEntity } from "@threenative/ir";

import {
  OCEAN_FRAGMENT_SHADER,
  advanceOceanWaterRuntime,
  applyOceanSkyReflection,
  createOceanWaterObject,
  readOceanWater,
} from "./oceanWater.js";

test("ocean water should use the engine-owned smooth analytic shader", () => {
  const object = createOceanWaterObject({ size: 24000, speed: 0.75 });
  const surface = object.children[0];

  assert.equal(object.name, "OceanWaterSurface");
  assert.equal(object.children.length, 1);
  assert.ok(surface instanceof THREE.Mesh);
  assert.equal(surface.name, "threenative-analytic-ocean-water-surface");
  assert.equal(surface.rotation.x, -Math.PI / 2);
  assert.equal(surface.frustumCulled, false);
  assert.ok(surface.material instanceof THREE.ShaderMaterial);
  assert.equal(surface.material.glslVersion, THREE.GLSL3);
  assert.match(surface.material.vertexShader, /surface \+= oceanWave/);
  assert.match(surface.material.vertexShader, /position\.z \+ surface\.x/);
  assert.match(surface.material.fragmentShader, /vec3 pos = vWorldPosition/);
  assert.match(surface.material.fragmentShader, /vec3 cameraDelta = cameraPosition - pos/);
  assert.match(surface.material.fragmentShader, /vec3 view = normalize\(cameraDelta\)/);
  assert.doesNotMatch(surface.material.fragmentShader, /gl_FragCoord/);
  assert.equal((surface.geometry as THREE.PlaneGeometry).parameters.width, 24000);
  assert.equal((surface.geometry as THREE.PlaneGeometry).parameters.widthSegments, 128);
  assert.equal((surface.geometry as THREE.PlaneGeometry).parameters.heightSegments, 128);
});

test("ocean water should advance shader time by the authored speed", () => {
  const object = createOceanWaterObject({ speed: 0.5 });
  const surface = object.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  advanceOceanWaterRuntime(object, 0.25);
  advanceOceanWaterRuntime(object, 0.25);

  assert.equal(surface.material.uniforms.iTime?.value, 0.25);
});

test("ocean shader should mirror the scene sky through a pow5 fresnel", () => {
  assert.match(OCEAN_FRAGMENT_SHADER, /float fresnel = 0\.02 \+ \d+\.\d+ \* pow\(1\.0 - ndv, 5\.0\)/);
  assert.match(OCEAN_FRAGMENT_SHADER, /vec3 refl = reflect\(-view, reflNormal\)/);
  assert.match(OCEAN_FRAGMENT_SHADER, /atan\(d\.z, d\.x\) \* OCEAN_RECIPROCAL_PI2 \+ 0\.5/);
  assert.match(OCEAN_FRAGMENT_SHADER, /asin\(clamp\(d\.y, -1\.0, 1\.0\)\) \* OCEAN_RECIPROCAL_PI \+ 0\.5/);
  assert.match(OCEAN_FRAGMENT_SHADER, /texture\(uSkyMap, uv\)/);
  assert.match(OCEAN_FRAGMENT_SHADER, /vec3 hazeColor = mix\(skyColor\(vec3\(-view\.x, 0\.03, -view\.z\)\), uHorizonColor, /);
  // The marbled foam field from the earlier shader must stay gone.
  assert.doesNotMatch(OCEAN_FRAGMENT_SHADER, /organicRidge|warpedPosition|waveDetail/);
});

test("applyOceanSkyReflection should bind the sky map and exposure to ocean materials", () => {
  const object = createOceanWaterObject({});
  const surface = object.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  const texture = new THREE.Texture();

  applyOceanSkyReflection(object, texture, 1.12);
  assert.equal(surface.material.uniforms.uSkyMap?.value, texture);
  assert.equal(surface.material.uniforms.uSkyMapStrength?.value, 1);
  assert.equal(surface.material.uniforms.uExposure?.value, 1.12);

  applyOceanSkyReflection(object, null, Number.NaN);
  assert.equal(surface.material.uniforms.uSkyMap?.value, null);
  assert.equal(surface.material.uniforms.uSkyMapStrength?.value, 0);
  assert.equal(surface.material.uniforms.uExposure?.value, 1);
});

test("readOceanWater should accept only object component values", () => {
  const entity = (value: unknown): IWorldEntity => ({
    components: { OceanWater: value },
    id: "ocean",
  });

  assert.deepEqual(readOceanWater(entity({ size: 1000, speed: 1.2 })), { size: 1000, speed: 1.2 });
  assert.equal(readOceanWater(entity(null)), undefined);
  assert.equal(readOceanWater(entity([])), undefined);
});
