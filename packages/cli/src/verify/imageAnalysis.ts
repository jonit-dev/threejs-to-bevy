export interface IPixelFrame {
  data: ArrayLike<number>;
  height: number;
  width: number;
}

export interface IPixelCheck {
  changedPixelRatio: number;
  ok: boolean;
  threshold: number;
}

export interface IFrameComparison extends IPixelCheck {
  averageBrightnessDelta: number;
  averageColorDelta: {
    blue: number;
    green: number;
    red: number;
  };
}

export const defaultNonblankThreshold = 0.002;
export const defaultDiffThreshold = 0.001;

export function analyzeNonblank(frame: IPixelFrame, threshold = defaultNonblankThreshold): IPixelCheck {
  const totalPixels = frame.width * frame.height;
  if (totalPixels <= 0) {
    return { changedPixelRatio: 0, ok: false, threshold };
  }

  let visiblePixels = 0;
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    const alpha = frame.data[index + 3] ?? 0;
    const brightest = Math.max(red, green, blue);
    const darkest = Math.min(red, green, blue);

    if (alpha > 0 && (brightest > 12 || brightest - darkest > 8)) {
      visiblePixels += 1;
    }
  }

  const changedPixelRatio = visiblePixels / totalPixels;
  return {
    changedPixelRatio,
    ok: changedPixelRatio >= threshold,
    threshold,
  };
}

export function analyzeRegionNonblank(
  frame: IPixelFrame,
  region: { height: number; width: number; x: number; y: number },
  threshold = defaultNonblankThreshold,
): IPixelCheck & { nonblankRatio: number } {
  const xEnd = Math.min(frame.width, region.x + region.width);
  const yEnd = Math.min(frame.height, region.y + region.height);
  let visiblePixels = 0;
  let totalPixels = 0;
  for (let y = Math.max(0, region.y); y < yEnd; y += 1) {
    for (let x = Math.max(0, region.x); x < xEnd; x += 1) {
      totalPixels += 1;
      const index = (y * frame.width + x) * 4;
      const red = frame.data[index] ?? 0;
      const green = frame.data[index + 1] ?? 0;
      const blue = frame.data[index + 2] ?? 0;
      const alpha = frame.data[index + 3] ?? 0;
      const brightest = Math.max(red, green, blue);
      const darkest = Math.min(red, green, blue);
      if (alpha > 0 && (brightest > 12 || brightest - darkest > 8)) {
        visiblePixels += 1;
      }
    }
  }
  const nonblankRatio = totalPixels === 0 ? 0 : visiblePixels / totalPixels;
  return {
    changedPixelRatio: nonblankRatio,
    nonblankRatio,
    ok: nonblankRatio >= threshold,
    threshold,
  };
}

export function compareFrames(
  first: IPixelFrame,
  second: IPixelFrame,
  threshold = defaultDiffThreshold,
): IFrameComparison {
  if (first.width !== second.width || first.height !== second.height) {
    return {
      averageBrightnessDelta: 1,
      averageColorDelta: { blue: 1, green: 1, red: 1 },
      changedPixelRatio: 1,
      ok: true,
      threshold,
    };
  }

  const totalPixels = first.width * first.height;
  if (totalPixels <= 0) {
    return {
      averageBrightnessDelta: 0,
      averageColorDelta: { blue: 0, green: 0, red: 0 },
      changedPixelRatio: 0,
      ok: false,
      threshold,
    };
  }

  let changedPixels = 0;
  let brightnessDelta = 0;
  let redDelta = 0;
  let greenDelta = 0;
  let blueDelta = 0;
  const length = Math.min(first.data.length, second.data.length);
  for (let index = 0; index < length; index += 4) {
    const firstRed = first.data[index] ?? 0;
    const firstGreen = first.data[index + 1] ?? 0;
    const firstBlue = first.data[index + 2] ?? 0;
    const secondRed = second.data[index] ?? 0;
    const secondGreen = second.data[index + 1] ?? 0;
    const secondBlue = second.data[index + 2] ?? 0;
    const currentRedDelta = Math.abs(firstRed - secondRed);
    const currentGreenDelta = Math.abs(firstGreen - secondGreen);
    const currentBlueDelta = Math.abs(firstBlue - secondBlue);
    const channelDelta =
      currentRedDelta +
      currentGreenDelta +
      currentBlueDelta +
      Math.abs((first.data[index + 3] ?? 0) - (second.data[index + 3] ?? 0));

    if (channelDelta > 12) {
      changedPixels += 1;
    }

    redDelta += currentRedDelta;
    greenDelta += currentGreenDelta;
    blueDelta += currentBlueDelta;
    brightnessDelta += Math.abs((firstRed + firstGreen + firstBlue) / 3 - (secondRed + secondGreen + secondBlue) / 3);
  }

  const changedPixelRatio = changedPixels / totalPixels;
  return {
    averageBrightnessDelta: brightnessDelta / totalPixels / 255,
    averageColorDelta: {
      blue: blueDelta / totalPixels / 255,
      green: greenDelta / totalPixels / 255,
      red: redDelta / totalPixels / 255,
    },
    changedPixelRatio,
    ok: changedPixelRatio >= threshold,
    threshold,
  };
}
