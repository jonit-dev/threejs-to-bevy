import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

import { compareFrames, type IFrameComparison, type IPixelFrame } from "./imageAnalysis.js";

export interface IImageComparisonReport extends IFrameComparison {
  firstPath: string;
  secondPath: string;
}

export async function compareImageFiles(firstPath: string, secondPath: string): Promise<IImageComparisonReport> {
  const first = await readPngFrame(firstPath);
  const second = await readPngFrame(secondPath);
  const comparison = compareFrames(first, second);

  return {
    ...comparison,
    firstPath,
    secondPath,
  };
}

export async function readPngFrame(path: string): Promise<IPixelFrame> {
  const png = PNG.sync.read(await readFile(path));
  return {
    data: png.data,
    height: png.height,
    width: png.width,
  };
}
