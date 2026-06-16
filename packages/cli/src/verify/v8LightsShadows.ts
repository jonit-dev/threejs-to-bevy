import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle } from "@threenative/runtime-web-three";

import { readPngFrame } from "./compareImages.js";
import { compareFrames, type IFrameComparison, type IPixelFrame } from "./imageAnalysis.js";

interface ILightComponent {
  kind: "ambient" | "directional" | "point" | "spot";
  shadowBias?: number;
  shadowNormalBias?: number;
}

interface IMeshRendererComponent {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

interface ILightShadowBundle {
  environmentScene?: {
    atmosphere?: {
      shadows?: {
        bias?: number;
        cascadeCount?: number;
        enabled?: boolean;
        mapSize?: number;
        maxDistance?: number;
        normalBias?: number;
        receiverPolicy?: string;
      };
    };
  };
  world: {
    entities: Array<{
      components: {
        Light?: ILightComponent;
        MeshRenderer?: IMeshRendererComponent;
      };
      id: string;
    }>;
  };
}

interface IV3SceneCapture {
  bevyGltfPath: string;
  bookmarkId: string;
  sideBySidePath?: string;
  threejsPath: string;
}

interface IV3SceneReport {
  artifacts?: {
    sideBySideContactSheetPath?: string;
  };
  captures?: IV3SceneCapture[];
}

interface IShadowSample {
  bevyGltfPath: string;
  bookmarkId: string;
  metrics: IFrameComparison;
  shadowTrace: {
    bevyDarkPixelRatio: number;
    darkPixelRatioDelta: number;
    interpretation: "bevy-darker-shadow-regions" | "near-neutral" | "threejs-darker-shadow-regions";
    threejsDarkPixelRatio: number;
  };
  threejsPath: string;
}

export interface IV8LightsShadowsReport {
  artifacts: {
    atmosphereReportPath?: string;
    bundlePath: string;
    contactSheetPath?: string;
    reportPath: string;
    sceneReportPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  lightTrace: {
    counts: {
      ambient: number;
      directional: number;
      point: number;
      shadowCasters: number;
      shadowReceivers: number;
      spot: number;
    };
    pointLightShadowParity: "not-proven";
    shadowBiasLights: Array<{ id: string; kind: ILightComponent["kind"]; shadowBias?: number; shadowNormalBias?: number }>;
  };
  samples: IShadowSample[];
  shadowPolicy?: NonNullable<NonNullable<NonNullable<ILightShadowBundle["environmentScene"]>["atmosphere"]>["shadows"]>;
  status: "fail" | "pass";
  summary: {
    averageDarkPixelRatioDelta: number;
    maxAverageBrightnessDelta: number;
    maxChangedPixelRatio: number;
    sampleCount: number;
  };
  thresholds: {
    mode: "report-only";
    note: string;
    suggestedShadowFixture: {
      averageBrightnessDelta: number;
      darkPixelRatioDelta: number;
    };
  };
  v8Scope: {
    prd: "V8-12";
    provenSlice: "shadow-policy-and-shadow-sensitive-capture-trace";
    visualParity: "not-asserted";
  };
}

export async function verifyV8LightsShadows(options: {
  artifactDir: string;
  atmosphereReportPath?: string;
  bundleLoader?: (bundlePath: string) => Promise<ILightShadowBundle>;
  bundlePath: string;
  sceneReportPath: string;
}): Promise<IV8LightsShadowsReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const reportPath = resolve(options.artifactDir, "v8-lights-shadows-report.json");
  const diagnostics: IV8LightsShadowsReport["diagnostics"] = [];
  const samples: IShadowSample[] = [];

  const bundleLoader = options.bundleLoader ?? ((bundlePath: string) => loadBundle(bundlePath) as Promise<ILightShadowBundle>);
  const bundle = await bundleLoader(options.bundlePath);
  const shadowPolicy = bundle.environmentScene?.atmosphere?.shadows;
  if (shadowPolicy?.enabled !== true) {
    diagnostics.push({
      code: "TN_V8_LIGHTS_SHADOWS_POLICY_MISSING",
      message: "V8-12 lights/shadows trace requires an enabled atmosphere shadow policy with bias and map metadata.",
      severity: "error",
    });
  }

  let sceneReport: IV3SceneReport | undefined;
  try {
    sceneReport = JSON.parse(await readFile(options.sceneReportPath, "utf8")) as IV3SceneReport;
  } catch (error) {
    diagnostics.push({
      code: "TN_V8_LIGHTS_SHADOWS_SCENE_REPORT_MISSING",
      message: `Could not read scene report '${options.sceneReportPath}': ${error instanceof Error ? error.message : String(error)}`,
      severity: "error",
    });
  }

  const captures = sceneReport?.captures ?? [];
  if (sceneReport !== undefined && captures.length === 0) {
    diagnostics.push({
      code: "TN_V8_LIGHTS_SHADOWS_CAPTURES_MISSING",
      message: "V8-12 lights/shadows trace requires matched Three.js and Bevy screenshot captures.",
      severity: "error",
    });
  }

  for (const capture of captures) {
    try {
      const three = await readPngFrame(capture.threejsPath);
      const bevy = await readPngFrame(capture.bevyGltfPath);
      const threejsDarkPixelRatio = darkPixelRatio(three);
      const bevyDarkPixelRatio = darkPixelRatio(bevy);
      const darkPixelRatioDelta = bevyDarkPixelRatio - threejsDarkPixelRatio;
      samples.push({
        bevyGltfPath: capture.bevyGltfPath,
        bookmarkId: capture.bookmarkId,
        metrics: compareFrames(three, bevy),
        shadowTrace: {
          bevyDarkPixelRatio,
          darkPixelRatioDelta,
          interpretation: classifyShadowTrace(darkPixelRatioDelta),
          threejsDarkPixelRatio,
        },
        threejsPath: capture.threejsPath,
      });
    } catch (error) {
      diagnostics.push({
        code: "TN_V8_LIGHTS_SHADOWS_CAPTURE_READ_FAILED",
        message: `Could not analyze shadow trace for bookmark '${capture.bookmarkId}': ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      });
    }
  }

  const report: IV8LightsShadowsReport = {
    artifacts: {
      atmosphereReportPath: options.atmosphereReportPath,
      bundlePath: options.bundlePath,
      contactSheetPath: sceneReport?.artifacts?.sideBySideContactSheetPath ?? captures[0]?.sideBySidePath,
      reportPath,
      sceneReportPath: options.sceneReportPath,
    },
    diagnostics,
    lightTrace: traceLights(bundle),
    samples,
    shadowPolicy,
    status: diagnostics.length === 0 ? "pass" : "fail",
    summary: summarizeSamples(samples),
    thresholds: {
      mode: "report-only",
      note: "This V8-12 slice records shadow-policy metadata and shadow-sensitive web/native screenshot drift; it does not assert point-light, PCF, probe, or full shadow parity.",
      suggestedShadowFixture: {
        averageBrightnessDelta: 0.08,
        darkPixelRatioDelta: 0.08,
      },
    },
    v8Scope: {
      prd: "V8-12",
      provenSlice: "shadow-policy-and-shadow-sensitive-capture-trace",
      visualParity: "not-asserted",
    },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function traceLights(bundle: ILightShadowBundle): IV8LightsShadowsReport["lightTrace"] {
  const counts = { ambient: 0, directional: 0, point: 0, shadowCasters: 0, shadowReceivers: 0, spot: 0 };
  const shadowBiasLights: IV8LightsShadowsReport["lightTrace"]["shadowBiasLights"] = [];
  for (const entity of bundle.world.entities) {
    const light = entity.components.Light;
    if (light !== undefined) {
      counts[light.kind] += 1;
      if (light.shadowBias !== undefined || light.shadowNormalBias !== undefined) {
        shadowBiasLights.push({
          id: entity.id,
          kind: light.kind,
          shadowBias: light.shadowBias,
          shadowNormalBias: light.shadowNormalBias,
        });
      }
    }
    const renderer = entity.components.MeshRenderer;
    if (renderer?.castShadow === true) {
      counts.shadowCasters += 1;
    }
    if (renderer?.receiveShadow === true) {
      counts.shadowReceivers += 1;
    }
  }
  return { counts, pointLightShadowParity: "not-proven", shadowBiasLights };
}

function darkPixelRatio(frame: IPixelFrame): number {
  const totalPixels = frame.width * frame.height;
  if (totalPixels <= 0) {
    return 0;
  }

  let darkPixels = 0;
  for (let index = 0; index < frame.data.length; index += 4) {
    const alpha = frame.data[index + 3] ?? 0;
    if (alpha === 0) {
      continue;
    }
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    if (luma < 0.28) {
      darkPixels += 1;
    }
  }
  return darkPixels / totalPixels;
}

function classifyShadowTrace(delta: number): IShadowSample["shadowTrace"]["interpretation"] {
  if (Math.abs(delta) < 0.03) {
    return "near-neutral";
  }
  return delta > 0 ? "bevy-darker-shadow-regions" : "threejs-darker-shadow-regions";
}

function summarizeSamples(samples: readonly IShadowSample[]): IV8LightsShadowsReport["summary"] {
  if (samples.length === 0) {
    return { averageDarkPixelRatioDelta: 0, maxAverageBrightnessDelta: 0, maxChangedPixelRatio: 0, sampleCount: 0 };
  }
  const totalDarkDelta = samples.reduce((total, sample) => total + Math.abs(sample.shadowTrace.darkPixelRatioDelta), 0);
  return {
    averageDarkPixelRatioDelta: totalDarkDelta / samples.length,
    maxAverageBrightnessDelta: Math.max(...samples.map((sample) => sample.metrics.averageBrightnessDelta)),
    maxChangedPixelRatio: Math.max(...samples.map((sample) => sample.metrics.changedPixelRatio)),
    sampleCount: samples.length,
  };
}
