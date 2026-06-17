/**
 * V10 visual calibration fixture registry.
 * Threshold changes require artifact evidence and PRD/status notes.
 */

export const VISUAL_CALIBRATION_VERSION = "v10.0.2";

/** @typedef {"color" | "materials" | "lighting" | "atmosphere" | "post" | "geometry" | "dense" | "scene"} FactorGroup */

/** @typedef {{ x: number; y: number; width: number; height: number }} NormalizedRegion */

/**
 * @typedef {Object} CalibrationRegion
 * @property {string} id
 * @property {FactorGroup | string} factor
 * @property {NormalizedRegion} region
 * @property {string} [hint]
 */

/**
 * @typedef {Object} CalibrationThresholds
 * @property {number} [changedPixelRatio]
 * @property {number} [averageBrightnessDelta]
 * @property {number} [averageColorDelta]
 * @property {number} [maxChannelDelta]
 * @property {number} [p95ChannelDelta]
 * @property {number} [luminanceDelta]
 * @property {number} [histogramDelta]
 * @property {number} [edgeDrift]
 * @property {number} [nonblankRatio]
 */

/**
 * @typedef {Object} CalibrationFixture
 * @property {string} id
 * @property {FactorGroup} factorGroup
 * @property {string} example
 * @property {string} bundleName
 * @property {boolean} promoted
 * @property {{ width: number; height: number }} capture
 * @property {{ id: string; projection?: "perspective" | "orthographic" }} camera
 * @property {string[]} requiredArtifacts
 * @property {CalibrationRegion[]} regions
 * @property {CalibrationThresholds} thresholds
 * @property {Record<string, string>} failureHints
 * @property {boolean} [implemented]
 */

export const VISUAL_CALIBRATION_FACTOR_GROUPS = [
  "color",
  "materials",
  "lighting",
  "atmosphere",
  "post",
  "geometry",
  "dense",
  "scene",
];

const strictUnlitThresholds = {
  averageBrightnessDelta: 0.02,
  averageColorDelta: 0.02,
  changedPixelRatio: 0.02,
  maxChannelDelta: 0.05,
  p95ChannelDelta: 0.03,
};

const litPbrThresholds = {
  averageBrightnessDelta: 0.05,
  averageColorDelta: 0.06,
  changedPixelRatio: 0.08,
  maxChannelDelta: 0.12,
  p95ChannelDelta: 0.1,
};

const lightingThresholds = {
  averageBrightnessDelta: 0.12,
  averageColorDelta: 0.14,
  changedPixelRatio: 0.92,
  maxChannelDelta: 0.18,
  p95ChannelDelta: 0.18,
};

const atmosphereThresholds = {
  averageBrightnessDelta: 0.4,
  averageColorDelta: 0.42,
  changedPixelRatio: 1,
  luminanceDelta: 0.4,
};

const postThresholds = {
  averageBrightnessDelta: 0.03,
  averageColorDelta: 0.03,
  changedPixelRatio: 0.02,
  maxChannelDelta: 0.7,
  p95ChannelDelta: 0.04,
};

const geometryThresholds = {
  averageBrightnessDelta: 0.28,
  averageColorDelta: 0.3,
  changedPixelRatio: 0.92,
  maxChannelDelta: 1,
  p95ChannelDelta: 0.4,
};

const denseThresholds = {
  averageBrightnessDelta: 0.03,
  averageColorDelta: 0.03,
  changedPixelRatio: 0.3,
  maxChannelDelta: 0.5,
  p95ChannelDelta: 0.3,
};

const sceneThresholds = {
  averageBrightnessDelta: 0.08,
  averageColorDelta: 0.09,
  changedPixelRatio: 1,
  histogramDelta: 2,
  luminanceDelta: 0.08,
  maxChannelDelta: 0.75,
  p95ChannelDelta: 0.3,
};

/** @type {CalibrationFixture[]} */
export const VISUAL_CALIBRATION_FIXTURES = [
  {
    id: "v10-color",
    factorGroup: "color",
    example: "examples/v10-visual-calibration-color",
    bundleName: "v10-visual-calibration-color.bundle",
    promoted: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "swatch-white", factor: "color", region: { x: 0.18, y: 0.64, width: 0.05, height: 0.08 }, hint: "opaque white swatch" },
      { id: "swatch-black", factor: "color", region: { x: 0.68, y: 0.64, width: 0.05, height: 0.08 }, hint: "opaque black swatch" },
      { id: "swatch-mid-gray", factor: "color", region: { x: 0.43, y: 0.64, width: 0.05, height: 0.08 }, hint: "mid-gray swatch" },
      { id: "background-opaque", factor: "color", region: { x: 0.72, y: 0.08, width: 0.12, height: 0.1 }, hint: "opaque background anchor" },
      { id: "background-alpha", factor: "color", region: { x: 0.72, y: 0.22, width: 0.12, height: 0.1 }, hint: "transparent background anchor" },
      { id: "frame-edge-top", factor: "camera", region: { x: 0.42, y: 0.01, width: 0.08, height: 0.03 }, hint: "top framing edge" },
      { id: "frame-edge-left", factor: "camera", region: { x: 0.01, y: 0.42, width: 0.03, height: 0.08 }, hint: "left framing edge" },
    ],
    thresholds: {
      ...strictUnlitThresholds,
      changedPixelRatio: 0.03,
      averageBrightnessDelta: 0.03,
      backgroundAlphaBrightnessDelta: 0.3,
    },
    failureHints: {
      color: "Check sRGB/linear conversion, tone mapping, exposure, and render-target readback.",
      camera: "Check perspective/orthographic framing and viewport placement.",
    },
    implemented: true,
  },
  {
    id: "v10-materials",
    factorGroup: "materials",
    example: "examples/v10-visual-calibration-materials",
    bundleName: "v10-visual-calibration-materials.bundle",
    promoted: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "unlit-card", factor: "materials", region: { x: 0.12, y: 0.4, width: 0.1, height: 0.18 }, hint: "unlit material card" },
      { id: "pbr-base", factor: "materials", region: { x: 0.34, y: 0.58, width: 0.1, height: 0.14 }, hint: "standard PBR base" },
      { id: "metal-rough", factor: "materials", region: { x: 0.69, y: 0.28, width: 0.08, height: 0.1 }, hint: "metalness/roughness card" },
      { id: "emissive", factor: "materials", region: { x: 0.72, y: 0.34, width: 0.08, height: 0.12 }, hint: "emissive card" },
      { id: "alpha-mask", factor: "materials", region: { x: 0.42, y: 0.38, width: 0.12, height: 0.18 }, hint: "alpha mask card" },
      { id: "texture-slot", factor: "materials", region: { x: 0.38, y: 0.08, width: 0.14, height: 0.18 }, hint: "texture sampling card" },
      { id: "uv-transform", factor: "materials", region: { x: 0.12, y: 0.12, width: 0.1, height: 0.14 }, hint: "UV transform card" },
      { id: "vertex-color", factor: "materials", region: { x: 0.72, y: 0.08, width: 0.1, height: 0.14 }, hint: "vertex color card" },
    ],
    thresholds: {
      ...litPbrThresholds,
      averageColorDelta: 0.08,
      averageBrightnessDelta: 0.32,
      changedPixelRatio: 0.16,
      maxChannelDelta: 0.55,
      p95ChannelDelta: 0.55,
      emissiveBrightnessDelta: 0.55,
      emissiveColorDelta: 0.85,
    },
    failureHints: {
      materials: "Check PBR slots, texture sampling, UV transforms, and alpha modes.",
    },
    implemented: true,
  },
  {
    id: "v10-lighting",
    factorGroup: "lighting",
    example: "examples/v10-visual-calibration-lighting",
    bundleName: "v10-visual-calibration-lighting.bundle",
    promoted: true,
    implemented: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "ambient-card", factor: "lighting", region: { x: 0.05, y: 0.1, width: 0.1, height: 0.12 }, hint: "ambient light card" },
      { id: "directional-card", factor: "lighting", region: { x: 0.18, y: 0.1, width: 0.1, height: 0.12 }, hint: "directional light card" },
      { id: "point-card", factor: "lighting", region: { x: 0.31, y: 0.1, width: 0.1, height: 0.12 }, hint: "point light card" },
      { id: "spot-card", factor: "lighting", region: { x: 0.44, y: 0.1, width: 0.1, height: 0.12 }, hint: "spot light card" },
      { id: "shadow-receiver", factor: "lighting", region: { x: 0.57, y: 0.1, width: 0.12, height: 0.14 }, hint: "shadow receiver card" },
      { id: "probe-reflection", factor: "lighting", region: { x: 0.74, y: 0.1, width: 0.12, height: 0.14 }, hint: "environment probe card" },
    ],
    thresholds: lightingThresholds,
    failureHints: {
      lighting: "Check light type, range/falloff, shadow caster/receiver policy, and probe contribution.",
    },
  },
  {
    id: "v10-atmosphere",
    factorGroup: "atmosphere",
    example: "examples/v10-visual-calibration-atmosphere",
    bundleName: "v10-visual-calibration-atmosphere.bundle",
    promoted: true,
    implemented: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "fog-near", factor: "atmosphere", region: { x: 0.2, y: 0.55, width: 0.08, height: 0.1 }, hint: "near fog band" },
      { id: "fog-mid", factor: "atmosphere", region: { x: 0.4, y: 0.45, width: 0.08, height: 0.1 }, hint: "mid fog band" },
      { id: "fog-far", factor: "atmosphere", region: { x: 0.6, y: 0.35, width: 0.08, height: 0.1 }, hint: "far fog band" },
      { id: "sky-horizon", factor: "atmosphere", region: { x: 0.05, y: 0.05, width: 0.9, height: 0.12 }, hint: "sky/horizon band" },
      { id: "skybox-anchor", factor: "atmosphere", region: { x: 0.82, y: 0.2, width: 0.12, height: 0.12 }, hint: "skybox anchor" },
    ],
    thresholds: atmosphereThresholds,
    failureHints: {
      atmosphere: "Check fog depth bands, sky/horizon, skybox, exposure, and color grading.",
    },
  },
  {
    id: "v10-post",
    factorGroup: "post",
    example: "examples/v10-visual-calibration-post",
    bundleName: "v10-visual-calibration-post.bundle",
    promoted: true,
    implemented: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "bloom-highlight", factor: "post", region: { x: 0.42, y: 0.35, width: 0.16, height: 0.16 }, hint: "bloom highlight card" },
      { id: "msaa-edge", factor: "post", region: { x: 0.1, y: 0.55, width: 0.12, height: 0.12 }, hint: "MSAA edge card" },
      { id: "dof-report-only", factor: "post-advanced", region: { x: 0.7, y: 0.55, width: 0.12, height: 0.12 }, hint: "report-only DOF probe" },
      { id: "taa-report-only", factor: "post-advanced", region: { x: 0.7, y: 0.7, width: 0.12, height: 0.12 }, hint: "report-only TAA probe" },
    ],
    thresholds: postThresholds,
    failureHints: {
      post: "Check bloom, MSAA, and promoted post effects.",
      "post-advanced": "Advanced post effects are report-only until promoted by V10-02.",
    },
  },
  {
    id: "v10-geometry",
    factorGroup: "geometry",
    example: "examples/v10-visual-calibration-geometry",
    bundleName: "v10-visual-calibration-geometry.bundle",
    promoted: true,
    implemented: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "primitive-grid", factor: "geometry", region: { x: 0.05, y: 0.15, width: 0.25, height: 0.25 }, hint: "primitive grid" },
      { id: "generated-mesh", factor: "geometry", region: { x: 0.35, y: 0.15, width: 0.25, height: 0.25 }, hint: "generated mesh card" },
      { id: "gltf-instance", factor: "geometry", region: { x: 0.58, y: 0.15, width: 0.12, height: 0.25 }, hint: "glTF instance card" },
      { id: "uv-marker", factor: "geometry", region: { x: 0.35, y: 0.5, width: 0.12, height: 0.12 }, hint: "UV marker region" },
    ],
    thresholds: geometryThresholds,
    failureHints: {
      geometry: "Check primitive/generated mesh output, normals, UVs, and glTF transforms.",
    },
  },
  {
    id: "v10-dense",
    factorGroup: "dense",
    example: "examples/v10-visual-calibration-dense",
    bundleName: "v10-visual-calibration-dense.bundle",
    promoted: true,
    implemented: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "instance-grid", factor: "dense", region: { x: 0.1, y: 0.2, width: 0.35, height: 0.35 }, hint: "repeated instance grid" },
      { id: "hlod-fade", factor: "dense", region: { x: 0.55, y: 0.2, width: 0.2, height: 0.2 }, hint: "HLOD fade marker" },
      { id: "visibility-range", factor: "dense", region: { x: 0.78, y: 0.2, width: 0.15, height: 0.2 }, hint: "visibility range marker" },
    ],
    thresholds: denseThresholds,
    failureHints: {
      dense: "Check instancing/batching observations against visible material/transform output.",
    },
  },
  {
    id: "v10-scene",
    factorGroup: "scene",
    example: "examples/v10-visual-calibration-scene",
    bundleName: "v10-visual-calibration-scene.bundle",
    promoted: true,
    implemented: true,
    capture: { width: 1280, height: 720 },
    camera: { id: "camera.calibration", projection: "orthographic" },
    requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
    regions: [
      { id: "sky-band", factor: "atmosphere", region: { x: 0.0, y: 0.0, width: 1.0, height: 0.15 }, hint: "combined scene sky band" },
      { id: "hero-subject", factor: "materials", region: { x: 0.35, y: 0.35, width: 0.3, height: 0.35 }, hint: "hero subject region" },
      { id: "ground-shadow", factor: "lighting", region: { x: 0.25, y: 0.65, width: 0.5, height: 0.15 }, hint: "ground shadow region" },
      { id: "ui-overlay", factor: "scene", region: { x: 0.02, y: 0.82, width: 0.2, height: 0.12 }, hint: "UI overlay sample" },
      { id: "full-frame", factor: "scene", region: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 }, hint: "full-frame aggregate" },
    ],
    thresholds: sceneThresholds,
    failureHints: {
      scene: "Check combined-scene composition across color, materials, lighting, atmosphere, and geometry.",
    },
  },
];

/** Report-only region factors that never fail the promoted gate by themselves. */
export const VISUAL_CALIBRATION_REPORT_ONLY_FACTORS = new Set([
  "post-advanced",
  "volumetric-report-only",
  "atmospheric-report-only",
]);

/**
 * @param {CalibrationFixture[]} fixtures
 * @returns {{ promoted: string[]; reportOnly: string[] }}
 */
export function partitionFixtureModes(fixtures) {
  const promoted = [];
  const reportOnly = [];
  for (const fixture of fixtures) {
    if (fixture.promoted) {
      promoted.push(fixture.id);
    } else {
      reportOnly.push(fixture.id);
    }
  }
  for (const fixture of fixtures) {
    for (const region of fixture.regions) {
      if (VISUAL_CALIBRATION_REPORT_ONLY_FACTORS.has(region.factor)) {
        reportOnly.push(`${fixture.id}:${region.id}`);
      }
    }
  }
  return {
    promoted: [...new Set(promoted)],
    reportOnly: [...new Set(reportOnly)],
  };
}

/**
 * @param {unknown} region
 * @returns {boolean}
 */
function isValidRegion(region) {
  if (region === null || typeof region !== "object") {
    return false;
  }
  const { x, y, width, height } = region;
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number" &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

/**
 * @param {unknown} thresholds
 * @returns {boolean}
 */
function hasThresholds(thresholds) {
  if (thresholds === null || typeof thresholds !== "object") {
    return false;
  }
  return Object.values(thresholds).some((value) => typeof value === "number" && Number.isFinite(value));
}

/**
 * @param {CalibrationFixture[]} fixtures
 * @returns {{ ok: boolean; diagnostics: object[] }}
 */
export function validateCalibrationManifest(fixtures = VISUAL_CALIBRATION_FIXTURES) {
  const diagnostics = [];

  for (const fixture of fixtures) {
    if (!fixture.id || typeof fixture.id !== "string") {
      diagnostics.push({
        code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
        fixtureId: fixture.id ?? "<missing>",
        message: "Calibration fixture is missing a string id.",
        severity: "error",
      });
      continue;
    }

    if (!VISUAL_CALIBRATION_FACTOR_GROUPS.includes(fixture.factorGroup)) {
      diagnostics.push({
        code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
        factorGroup: fixture.factorGroup,
        fixtureId: fixture.id,
        message: `Calibration fixture '${fixture.id}' has unknown factor group '${fixture.factorGroup ?? ""}'.`,
        severity: "error",
      });
    }

    if (!Array.isArray(fixture.regions) || fixture.regions.length === 0) {
      diagnostics.push({
        code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
        fixtureId: fixture.id,
        message: `Calibration fixture '${fixture.id}' must define at least one sample region.`,
        severity: "error",
      });
    } else {
      for (const region of fixture.regions) {
        if (!region?.id || !isValidRegion(region.region)) {
          diagnostics.push({
            code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
            fixtureId: fixture.id,
            message: `Calibration fixture '${fixture.id}' has an invalid region '${region?.id ?? "<missing>"}'.`,
            regionId: region?.id,
            severity: "error",
          });
        }
      }
    }

    if (!hasThresholds(fixture.thresholds)) {
      diagnostics.push({
        code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
        fixtureId: fixture.id,
        message: `Calibration fixture '${fixture.id}' must define numeric thresholds.`,
        severity: "error",
      });
    }

    if (!fixture.capture?.width || !fixture.capture?.height) {
      diagnostics.push({
        code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
        fixtureId: fixture.id,
        message: `Calibration fixture '${fixture.id}' must define capture width and height.`,
        severity: "error",
      });
    }

    if (!fixture.camera?.id) {
      diagnostics.push({
        code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
        fixtureId: fixture.id,
        message: `Calibration fixture '${fixture.id}' must define a camera anchor id.`,
        severity: "error",
      });
    }

    if (!Array.isArray(fixture.requiredArtifacts) || fixture.requiredArtifacts.length === 0) {
      diagnostics.push({
        code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
        fixtureId: fixture.id,
        message: `Calibration fixture '${fixture.id}' must declare required artifacts.`,
        severity: "error",
      });
    }
  }

  const ids = fixtures.map((fixture) => fixture.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const fixtureId of [...new Set(duplicates)]) {
    diagnostics.push({
      code: "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID",
      fixtureId,
      message: `Calibration manifest contains duplicate fixture id '${fixtureId}'.`,
      severity: "error",
    });
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

/**
 * @param {string[] | undefined} groups
 * @param {CalibrationFixture[]} fixtures
 * @returns {CalibrationFixture[]}
 */
export function selectCalibrationFixtures(groups, fixtures = VISUAL_CALIBRATION_FIXTURES) {
  if (!groups || groups.length === 0) {
    return fixtures;
  }
  const wanted = new Set(groups);
  return fixtures.filter((fixture) => wanted.has(fixture.factorGroup));
}

/**
 * @param {CalibrationFixture[]} fixtures
 * @returns {Record<string, { fixtures: CalibrationFixture[] }>}
 */
export function groupFixturesByFactor(fixtures) {
  /** @type {Record<string, { fixtures: CalibrationFixture[] }>} */
  const factorGroups = {};
  for (const group of VISUAL_CALIBRATION_FACTOR_GROUPS) {
    factorGroups[group] = { fixtures: [] };
  }
  for (const fixture of fixtures) {
    factorGroups[fixture.factorGroup].fixtures.push(fixture);
  }
  return factorGroups;
}
