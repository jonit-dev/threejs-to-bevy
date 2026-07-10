import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import * as THREE from "three";
import type { IWorldIr } from "@threenative/ir";

import {
  contactShadowOccupancyAtHeight,
  createContactShadowsManager,
  type IContactShadowRenderer,
} from "./contactShadows.js";
import { loadBundle } from "../loadBundle.js";
import { mapWorld, type IThreeWorld } from "../mapWorld.js";

test("contact shadow height attenuation should be strongest at contact and fade to zero at capture height", () => {
  assert.equal(contactShadowOccupancyAtHeight(0, 4), 1);
  assert.equal(contactShadowOccupancyAtHeight(2, 4), 0.5);
  assert.equal(contactShadowOccupancyAtHeight(4, 4), 0);
});

test("contact shadows should capture static regions once and invalidate when an in-region caster moves", () => {
  const fixture = contactFixture("static", 512);
  const renderer = new FakeRenderer();
  const userMaterial = fixture.caster.material;
  const manager = createContactShadowsManager({ mapped: fixture.mapped, renderer, world: fixture.world });

  manager.update(fixture.world);
  manager.update(fixture.world);
  assert.deepEqual(renderer.renderedCameras.slice(-2).map((camera) => camera.position.z), [1, 1], "blur passes must render in front of the fullscreen plane");
  assert.deepEqual(manager.observations(), [{
    appliedResolution: 512,
    blurStep: 1.5 / 512,
    captureWorldPosition: [0, 4, 0],
    captureCount: 1,
    compositeWorldPosition: [0, 0.002, 0],
    entityId: "contact.ground",
    height: 4,
    heightAttenuation: "linear-depth",
    invalidated: false,
    opacity: 0.6,
    proxyReconcileCount: 1,
    renderCount: 3,
    requestedResolution: 512,
    size: [8, 8],
    softness: 1.5,
    updateMode: "static",
  }]);
  assert.equal(fixture.caster.material, userMaterial, "capture must preserve the user material");

  fixture.caster.position.x = 0.5;
  fixture.caster.updateMatrixWorld(true);
  manager.update(fixture.world);
  assert.equal(manager.observations()[0]?.captureCount, 2);
  assert.equal(manager.observations()[0]?.renderCount, 6);
  assert.equal(manager.observations()[0]?.proxyReconcileCount, 2);

  fixture.caster.position.x = 10;
  fixture.caster.updateMatrixWorld(true);
  manager.update(fixture.world);
  assert.equal(manager.observations()[0]?.captureCount, 3, "leaving the region invalidates its previous shadow");
  fixture.caster.position.x = 11;
  fixture.caster.updateMatrixWorld(true);
  manager.update(fixture.world);
  assert.equal(manager.observations()[0]?.captureCount, 3, "movement wholly outside the tracked region stays free");
  assert.equal(manager.observations()[0]?.proxyReconcileCount, 3, "unchanged empty membership performs no proxy allocation work");

  manager.dispose();
  assert.equal(fixture.caster.layers.mask, 1, "dispose must restore the caster's authored layer mask");
  assert.equal(fixture.anchor.children.length, 0, "adapter-private composite resources must leave the authored anchor");
});

test("contact shadows should align translated capture cameras and composites with their anchors", () => {
  const fixture = contactFixture("static", 256);
  fixture.anchor.position.set(-2.2, 0.01, 0);
  const secondAnchor = fixture.anchor.clone(false);
  secondAnchor.position.set(2.2, 0.01, 0);
  const parent = new THREE.Group();
  parent.position.set(1, 0.5, -0.75);
  parent.rotation.set(0.1, 0.35, -0.08);
  fixture.mapped.scene.add(parent);
  parent.add(fixture.anchor, secondAnchor);
  fixture.mapped.objectsById.set("contact.second", secondAnchor);
  fixture.world.entities.push({
    components: {
      ContactShadows: { height: 4, opacity: 0.8, resolution: 256, size: [3.5, 3.5], softness: 1.5, updateMode: "static" },
      Transform: { position: [2.2, 0.01, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    },
    id: "contact.second",
  });
  const manager = createContactShadowsManager({ mapped: fixture.mapped, renderer: new FakeRenderer(), world: fixture.world });

  manager.update(fixture.world);
  const observations = manager.observations();
  const expectedCapturePositions = [fixture.anchor, secondAnchor].map((anchor) => rounded(anchor.localToWorld(new THREE.Vector3(0, 4, 0)).toArray()));
  const expectedCompositePositions = [fixture.anchor, secondAnchor].map((anchor) => rounded(anchor.localToWorld(new THREE.Vector3(0, 0.002, 0)).toArray()));
  assert.deepEqual(observations.map((entry) => rounded(entry.captureWorldPosition)), expectedCapturePositions);
  assert.deepEqual(observations.map((entry) => rounded(entry.compositeWorldPosition)), expectedCompositePositions);
  manager.dispose();
});

test("contact shadows should invalidate a static capture when its anchor moves without reallocating proxies", () => {
  const fixture = contactFixture("static", 256);
  const manager = createContactShadowsManager({ mapped: fixture.mapped, renderer: new FakeRenderer(), world: fixture.world });
  manager.update(fixture.world);

  fixture.anchor.position.set(0.1, 0, 0);
  fixture.anchor.rotation.y = Math.PI / 6;
  fixture.anchor.updateMatrixWorld(true);
  manager.update(fixture.world);

  assert.equal(manager.observations()[0]?.captureCount, 2);
  assert.equal(manager.observations()[0]?.proxyReconcileCount, 1, "anchor motion must not reallocate an unchanged proxy set");
  manager.dispose();
});

test("contact shadows should recapture a reconciled static shadow after authored transform and config changes", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/contact-shadows-grounding/game.bundle"));
  const mapped = mapWorld(bundle);
  const renderer = new FakeRenderer();
  const manager = createContactShadowsManager({ mapped, renderer, world: bundle.world });
  manager.update(bundle.world);
  const initialRenderCount = renderer.renderedCameras.length;
  const initialAnchor = mapped.objectsById.get("contact.low-opacity");
  const entityIndex = bundle.world.entities.findIndex((entity) => entity.id === "contact.low-opacity");
  const entity = bundle.world.entities[entityIndex];
  assert.ok(entity !== undefined);
  assert.ok(entity.components.ContactShadows !== undefined);
  assert.ok(entity.components.Transform !== undefined);

  bundle.world.entities[entityIndex] = {
    ...entity,
    components: {
      ...entity.components,
      ContactShadows: { ...entity.components.ContactShadows, opacity: 0.5 },
      Transform: { ...entity.components.Transform, position: [-1.8, 0.01, 0] },
    },
  };
  mapped.reconcile?.(bundle.world);
  manager.update(bundle.world);

  assert.notEqual(mapped.objectsById.get("contact.low-opacity"), initialAnchor, "reconciliation must rebuild an authored contact-shadow anchor when its config changes");
  assert.equal(renderer.renderedCameras.length, initialRenderCount + 3, "the changed static shadow must run capture and both blur passes again");
  const observation = manager.observations().find((entry) => entry.entityId === "contact.low-opacity");
  assert.equal(observation?.opacity, 0.5);
  assert.deepEqual(rounded(observation?.captureWorldPosition ?? []), [-1.8, 4.01, 0]);
  manager.dispose();
});

test("contact shadows should exclude casters hidden by an ancestor", () => {
  const fixture = contactFixture("static", 256);
  const hiddenParent = new THREE.Group();
  hiddenParent.visible = false;
  fixture.mapped.scene.add(hiddenParent);
  hiddenParent.add(fixture.caster);
  fixture.mapped.scene.updateMatrixWorld(true);
  const renderer = new FakeRenderer();
  const manager = createContactShadowsManager({ mapped: fixture.mapped, renderer, world: fixture.world });

  manager.update(fixture.world);
  assert.equal(renderer.renderedScenes[0]?.children.length, 0, "hidden hierarchy must not emit a capture proxy");
  manager.dispose();
});

test("contact shadows should render dynamic regions each frame and clamp low-tier resolution", () => {
  const fixture = contactFixture("dynamic", 1024);
  const manager = createContactShadowsManager({ dynamicResolutionLimit: 256, mapped: fixture.mapped, renderer: new FakeRenderer(), world: fixture.world });

  manager.update(fixture.world);
  manager.update(fixture.world);
  const observation = manager.observations()[0];
  assert.equal(observation?.requestedResolution, 1024);
  assert.equal(observation?.appliedResolution, 256);
  assert.equal(observation?.blurStep, 1.5 / 256, "blur must derive from the applied target resolution");
  assert.equal(observation?.captureCount, 2);
  assert.equal(observation?.renderCount, 6);
  assert.equal(manager.requiresContinuousUpdates(), true);
  manager.dispose();
});

test("contact shadows should restore renderer state and reconcile component removal", () => {
  const fixture = contactFixture("static", 256);
  const renderer = new FakeRenderer();
  const previousTarget = new THREE.WebGLRenderTarget(4, 4);
  renderer.setRenderTarget(previousTarget);
  renderer.autoClear = false;
  renderer.xr.enabled = true;
  renderer.setScissorTest(true);
  const manager = createContactShadowsManager({ mapped: fixture.mapped, renderer, world: fixture.world });

  manager.update(fixture.world);
  assert.equal(renderer.getRenderTarget(), previousTarget);
  assert.equal(renderer.autoClear, false);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.getScissorTest(), true);
  assert.equal(fixture.mapped.scene.overrideMaterial, null);

  manager.invalidate("contact.ground");
  assert.equal(manager.observations()[0]?.invalidated, true);
  manager.update(fixture.world);
  assert.equal(manager.observations()[0]?.captureCount, 2);

  fixture.world.entities = fixture.world.entities.filter((entity) => entity.id !== "contact.ground");
  manager.sync(fixture.world);
  assert.deepEqual(manager.observations(), []);
  assert.equal(fixture.anchor.children.length, 0);
  previousTarget.dispose();
  manager.dispose();
});

class FakeRenderer implements IContactShadowRenderer {
  autoClear = true;
  readonly xr = { enabled: false };
  readonly renderedCameras: THREE.Camera[] = [];
  readonly renderedScenes: THREE.Object3D[] = [];
  private clearAlpha = 1;
  private clearColor = new THREE.Color("#223344");
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private scissor = new THREE.Vector4(1, 2, 3, 4);
  private scissorTest = false;
  private viewport = new THREE.Vector4(5, 6, 7, 8);

  clear(): void {}
  getClearAlpha(): number { return this.clearAlpha; }
  getClearColor(target: THREE.Color): THREE.Color { return target.copy(this.clearColor); }
  getRenderTarget(): THREE.WebGLRenderTarget | null { return this.renderTarget; }
  getScissor(target: THREE.Vector4): THREE.Vector4 { return target.copy(this.scissor); }
  getScissorTest(): boolean { return this.scissorTest; }
  getViewport(target: THREE.Vector4): THREE.Vector4 { return target.copy(this.viewport); }
  render(scene: THREE.Object3D, camera: THREE.Camera): void { this.renderedScenes.push(scene); this.renderedCameras.push(camera); }
  setClearColor(color: THREE.ColorRepresentation, alpha = 1): void { this.clearColor.set(color); this.clearAlpha = alpha; }
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void { this.renderTarget = target; }
  setScissor(value: THREE.Vector4): void { this.scissor.copy(value); }
  setScissorTest(enabled: boolean): void { this.scissorTest = enabled; }
  setViewport(value: THREE.Vector4): void { this.viewport.copy(value); }
}

function rounded(values: readonly number[]): number[] {
  return values.map((value) => Number(value.toFixed(6)));
}

function contactFixture(updateMode: "dynamic" | "static", resolution: 128 | 256 | 512 | 1024): {
  anchor: THREE.Object3D;
  caster: THREE.Mesh;
  mapped: IThreeWorld;
  world: IWorldIr;
} {
  const scene = new THREE.Scene();
  const anchor = new THREE.Object3D();
  const caster = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  caster.castShadow = true;
  caster.position.y = 0.5;
  scene.add(anchor, caster);
  scene.updateMatrixWorld(true);
  const world: IWorldIr = {
    entities: [
      {
        components: {
          ContactShadows: { height: 4, opacity: 0.6, resolution, size: [8, 8], softness: 1.5, updateMode },
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
        id: "contact.ground",
      },
      {
        components: {
          MeshRenderer: { castShadow: true, material: "mat.caster", mesh: "mesh.caster" },
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
        id: "caster",
      },
    ],
    events: {},
    prefabs: [],
    resources: {},
    schema: "threenative.world",
    version: "0.1.0",
  };
  return {
    anchor,
    caster,
    mapped: {
      camera: new THREE.PerspectiveCamera(),
      cameras: new Map(),
      cameraViews: [],
      diagnostics: [],
      layerAllocation: new Map([["default", 0]]),
      objectsById: new Map([["contact.ground", anchor], ["caster", caster]]),
      scene,
    },
    world,
  };
}
