import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readPngFrame } from "./compareImages.js";
import { compareFrames, type IFrameComparison, type IPixelFrame } from "./imageAnalysis.js";

interface IV3SceneCapture {
  bookmarkId: string;
  bevyGltfPath: string;
  threejsPath: string;
}

interface IV3SceneReport {
  captures?: IV3SceneCapture[];
}

interface ILightingColorMetrics extends IFrameComparison {
  signedAverageBrightnessDelta: number;
  signedAverageColorDelta: {
    blue: number;
    green: number;
    red: number;
  };
}

interface ILightingColorSample {
  bevyGltfPath: string;
  bookmarkId: string;
  interpretation: {
    colorBias: "bevy-bluer" | "bevy-darker" | "bevy-greener" | "bevy-redder" | "bevy-warmer" | "near-neutral";
  };
  metrics: ILightingColorMetrics;
  threejsPath: string;
}

const V3_LIGHTING_COLOR_THRESHOLDS = {
  maxAverageBrightnessDelta: 0.08,
  maxAverageColorDelta: 0.08,
} as const;

export interface IV3LightingColorReport {
  artifacts: {
    reportPath: string;
    sceneReportPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  samples: ILightingColorSample[];
  status: "fail" | "pass";
  summary: {
    averageBrightnessDelta: number;
    averageColorDelta: {
      blue: number;
      green: number;
      red: number;
    };
    maxBrightnessDelta: number;
    maxColorDelta: {
      blue: number;
      green: number;
      red: number;
    };
    signedAverageBrightnessDelta: number;
    signedAverageColorDelta: {
      blue: number;
      green: number;
      red: number;
    };
  };
  thresholds: {
    maxAverageBrightnessDelta: number;
    maxAverageColorDelta: number;
    mode: "asserted";
    note: string;
  };
}

export async function verifyV3LightingColor(options: {
  artifactDir: string;
  sceneReportPath?: string;
}): Promise<IV3LightingColorReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const reportPath = resolve(options.artifactDir, "v3-lighting-color-report.json");
  const sceneReportPath = options.sceneReportPath ?? resolve(options.artifactDir, "v3-scene-report.json");
  const diagnostics: IV3LightingColorReport["diagnostics"] = [];
  const samples: ILightingColorSample[] = [];

  let sceneReport: IV3SceneReport | undefined;
  try {
    sceneReport = JSON.parse(await readFile(sceneReportPath, "utf8")) as IV3SceneReport;
  } catch (error) {
    diagnostics.push({
      code: "TN_V3_LIGHTING_COLOR_SCENE_REPORT_MISSING",
      message: `Could not read V3 scene report '${sceneReportPath}': ${error instanceof Error ? error.message : String(error)}`,
      severity: "error",
    });
  }

  const captures = sceneReport?.captures ?? [];
  if (sceneReport !== undefined && captures.length === 0) {
    diagnostics.push({
      code: "TN_V3_LIGHTING_COLOR_CAPTURES_MISSING",
      message: "V3 lighting/color verification requires Three.js and Bevy capture pairs from v3-scene-report.json.",
      severity: "error",
    });
  }

  for (const capture of captures) {
    try {
      const three = await readPngFrame(capture.threejsPath);
      const bevy = await readPngFrame(capture.bevyGltfPath);
      const metrics = compareLightingColor(three, bevy);
      samples.push({
        bevyGltfPath: capture.bevyGltfPath,
        bookmarkId: capture.bookmarkId,
        interpretation: { colorBias: classifyColorBias(metrics) },
        metrics,
        threejsPath: capture.threejsPath,
      });
    } catch (error) {
      diagnostics.push({
        code: "TN_V3_LIGHTING_COLOR_CAPTURE_READ_FAILED",
        message: `Could not compare bookmark '${capture.bookmarkId}': ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      });
    }
  }

  const summary = summarizeSamples(samples);
  if (samples.length > 0 && summary.maxBrightnessDelta > V3_LIGHTING_COLOR_THRESHOLDS.maxAverageBrightnessDelta) {
    diagnostics.push({
      code: "TN_V3_LIGHTING_COLOR_BRIGHTNESS_DRIFT",
      message: `V3 max brightness delta ${summary.maxBrightnessDelta.toFixed(4)} exceeds ${V3_LIGHTING_COLOR_THRESHOLDS.maxAverageBrightnessDelta}.`,
      severity: "error",
    });
  }
  const maxChannelDelta = Math.max(summary.maxColorDelta.red, summary.maxColorDelta.green, summary.maxColorDelta.blue);
  if (samples.length > 0 && maxChannelDelta > V3_LIGHTING_COLOR_THRESHOLDS.maxAverageColorDelta) {
    diagnostics.push({
      code: "TN_V3_LIGHTING_COLOR_CHANNEL_DRIFT",
      message: `V3 max channel delta ${maxChannelDelta.toFixed(4)} exceeds ${V3_LIGHTING_COLOR_THRESHOLDS.maxAverageColorDelta}.`,
      severity: "error",
    });
  }

  const report: IV3LightingColorReport = {
    artifacts: { reportPath, sceneReportPath },
    diagnostics,
    samples,
    status: diagnostics.length === 0 ? "pass" : "fail",
    summary,
    thresholds: {
      maxAverageBrightnessDelta: V3_LIGHTING_COLOR_THRESHOLDS.maxAverageBrightnessDelta,
      maxAverageColorDelta: V3_LIGHTING_COLOR_THRESHOLDS.maxAverageColorDelta,
      mode: "asserted",
      note: "Full forest screenshots must stay within coarse brightness/channel bounds so web and Bevy terrain, lighting, and color-space regressions are caught.",
    },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function compareLightingColor(three: IPixelFrame, bevy: IPixelFrame): ILightingColorMetrics {
  const absolute = compareFrames(three, bevy);
  const signed = signedFrameDelta(three, bevy);
  return {
    ...absolute,
    signedAverageBrightnessDelta: signed.brightness,
    signedAverageColorDelta: signed.color,
  };
}

function signedFrameDelta(
  first: IPixelFrame,
  second: IPixelFrame,
): { brightness: number; color: ILightingColorMetrics["signedAverageColorDelta"] } {
  if (first.width !== second.width || first.height !== second.height || first.width * first.height <= 0) {
    return { brightness: 0, color: { blue: 0, green: 0, red: 0 } };
  }

  const totalPixels = first.width * first.height;
  let brightness = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  const length = Math.min(first.data.length, second.data.length);
  for (let index = 0; index < length; index += 4) {
    const firstRed = first.data[index] ?? 0;
    const firstGreen = first.data[index + 1] ?? 0;
    const firstBlue = first.data[index + 2] ?? 0;
    const secondRed = second.data[index] ?? 0;
    const secondGreen = second.data[index + 1] ?? 0;
    const secondBlue = second.data[index + 2] ?? 0;
    red += secondRed - firstRed;
    green += secondGreen - firstGreen;
    blue += secondBlue - firstBlue;
    brightness += (secondRed + secondGreen + secondBlue - firstRed - firstGreen - firstBlue) / 3;
  }

  return {
    brightness: brightness / totalPixels / 255,
    color: {
      blue: blue / totalPixels / 255,
      green: green / totalPixels / 255,
      red: red / totalPixels / 255,
    },
  };
}

function classifyColorBias(metrics: ILightingColorMetrics): ILightingColorSample["interpretation"]["colorBias"] {
  const { blue, green, red } = metrics.signedAverageColorDelta;
  const brightness = metrics.signedAverageBrightnessDelta;
  const strongest = Math.max(Math.abs(red), Math.abs(green), Math.abs(blue), Math.abs(brightness));
  if (strongest < 0.02) {
    return "near-neutral";
  }
  if (brightness < -0.04 && Math.abs(brightness) >= strongest) {
    return "bevy-darker";
  }
  if (red > 0.02 && green > 0.02 && blue < red - 0.02 && blue < green - 0.02) {
    return "bevy-warmer";
  }
  if (green >= red && green >= blue && green > 0.02) {
    return "bevy-greener";
  }
  if (red >= green && red >= blue && red > 0.02) {
    return "bevy-redder";
  }
  if (blue > 0.02) {
    return "bevy-bluer";
  }
  return "near-neutral";
}

function summarizeSamples(samples: readonly ILightingColorSample[]): IV3LightingColorReport["summary"] {
  if (samples.length === 0) {
    return {
      averageBrightnessDelta: 0,
      averageColorDelta: { blue: 0, green: 0, red: 0 },
      maxBrightnessDelta: 0,
      maxColorDelta: { blue: 0, green: 0, red: 0 },
      signedAverageBrightnessDelta: 0,
      signedAverageColorDelta: { blue: 0, green: 0, red: 0 },
    };
  }

  const total = samples.reduce(
    (acc, sample) => {
      acc.averageBrightnessDelta += sample.metrics.averageBrightnessDelta;
      acc.averageColorDelta.red += sample.metrics.averageColorDelta.red;
      acc.averageColorDelta.green += sample.metrics.averageColorDelta.green;
      acc.averageColorDelta.blue += sample.metrics.averageColorDelta.blue;
      acc.maxBrightnessDelta = Math.max(acc.maxBrightnessDelta, sample.metrics.averageBrightnessDelta);
      acc.maxColorDelta.red = Math.max(acc.maxColorDelta.red, sample.metrics.averageColorDelta.red);
      acc.maxColorDelta.green = Math.max(acc.maxColorDelta.green, sample.metrics.averageColorDelta.green);
      acc.maxColorDelta.blue = Math.max(acc.maxColorDelta.blue, sample.metrics.averageColorDelta.blue);
      acc.signedAverageBrightnessDelta += sample.metrics.signedAverageBrightnessDelta;
      acc.signedAverageColorDelta.red += sample.metrics.signedAverageColorDelta.red;
      acc.signedAverageColorDelta.green += sample.metrics.signedAverageColorDelta.green;
      acc.signedAverageColorDelta.blue += sample.metrics.signedAverageColorDelta.blue;
      return acc;
    },
    {
      averageBrightnessDelta: 0,
      averageColorDelta: { blue: 0, green: 0, red: 0 },
      maxBrightnessDelta: 0,
      maxColorDelta: { blue: 0, green: 0, red: 0 },
      signedAverageBrightnessDelta: 0,
      signedAverageColorDelta: { blue: 0, green: 0, red: 0 },
    },
  );
  const count = samples.length;
  return {
    averageBrightnessDelta: total.averageBrightnessDelta / count,
    averageColorDelta: {
      blue: total.averageColorDelta.blue / count,
      green: total.averageColorDelta.green / count,
      red: total.averageColorDelta.red / count,
    },
    maxBrightnessDelta: total.maxBrightnessDelta,
    maxColorDelta: total.maxColorDelta,
    signedAverageBrightnessDelta: total.signedAverageBrightnessDelta / count,
    signedAverageColorDelta: {
      blue: total.signedAverageColorDelta.blue / count,
      green: total.signedAverageColorDelta.green / count,
      red: total.signedAverageColorDelta.red / count,
    },
  };
}
