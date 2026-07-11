import assert from "node:assert/strict";
import test from "node:test";
import { webComposerFeatureOrder, webComposerRequiresContinuousUpdates } from "./render.js";

test("web composer keeps volumetrics before bloom, depth of field, and motion blur", () => {
  assert.deepEqual(webComposerFeatureOrder({
    ambientOcclusion: true,
    bloom: true,
    depthOfField: true,
    godRays: true,
    heightFog: true,
    motionBlur: true,
    ssgi: true,
  }), ["ambientOcclusion", "ssgi", "godRays", "heightFog", "bloom", "depthOfField", "motionBlur"]);
});

test("web composer keeps rendering static scenes while temporal SSGI is active", () => {
  assert.equal(webComposerRequiresContinuousUpdates({ ssgi: true }), true);
  assert.equal(webComposerRequiresContinuousUpdates({ bloom: true }), false);
});
