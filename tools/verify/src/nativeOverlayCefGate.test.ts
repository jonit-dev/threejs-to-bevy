import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateNativeOverlayFrames,
  type NativeOverlayFrameSet,
  type PixelFrame,
} from "./nativeOverlayCefGate.js";

test("should reject stale chooser and modal pixels", () => {
  const chooser = solidFrame(20);
  const frames: NativeOverlayFrameSet = {
    chooser,
    hoverAfter: solidFrame(50),
    hoverBefore: solidFrame(20),
    hud: chooser,
    settingsClosed: solidFrame(80),
    settingsOpen: solidFrame(80),
  };
  const result = evaluateNativeOverlayFrames(frames, fullRegions());

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_NATIVE_OVERLAY_CEF_STALE_CHOOSER"), true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_NATIVE_OVERLAY_CEF_STALE_MODAL"), true);
});

test("should reject a blank overlay frame", () => {
  const frames = completeFrames();
  frames.hud = solidFrame(0, 0);
  const result = evaluateNativeOverlayFrames(frames, fullRegions());

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_NATIVE_OVERLAY_CEF_BLANK_FRAME"), true);
});

test("should reject metrics sampled outside the changed region", () => {
  const frames = completeFrames();
  frames.hoverAfter = regionFrame(20, 80, { x: 600, y: 300, width: 300, height: 160 });
  const result = evaluateNativeOverlayFrames(frames, {
    hover: { x: 0, y: 0, width: 100, height: 100 },
    modal: { x: 0, y: 0, width: 1280, height: 720 },
  });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_NATIVE_OVERLAY_CEF_HOVER_PIXELS_MISSING"), true);
});

test("should pass chooser hud settings and hover transitions", () => {
  const result = evaluateNativeOverlayFrames(completeFrames(), fullRegions());

  assert.deepEqual(result.diagnostics, []);
});

function completeFrames(): NativeOverlayFrameSet {
  return {
    chooser: solidFrame(20),
    hoverAfter: solidFrame(50),
    hoverBefore: solidFrame(20),
    hud: solidFrame(100),
    settingsClosed: solidFrame(80),
    settingsOpen: solidFrame(140),
  };
}

function solidFrame(value: number, alpha = 255): PixelFrame {
  const data = new Uint8Array(1280 * 720 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = alpha;
  }
  return { data, height: 720, width: 1280 };
}

function regionFrame(base: number, changed: number, region: { x: number; y: number; width: number; height: number }): PixelFrame {
  const frame = solidFrame(base);
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * frame.width + x) * 4;
      frame.data[offset] = changed;
      frame.data[offset + 1] = changed;
      frame.data[offset + 2] = changed;
    }
  }
  return frame;
}

function fullRegions() {
  return {
    hover: { x: 0, y: 0, width: 1280, height: 720 },
    modal: { x: 0, y: 0, width: 1280, height: 720 },
  };
}
