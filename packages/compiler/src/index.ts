export { captureEntry, isSceneRoot, type ICapturedScene } from "./capture.js";
export { loadProjectConfig, type IProjectConfig } from "./config.js";
export { CompilerError } from "./errors.js";
export { emitBundle } from "./emit/bundle.js";

export async function buildProject(projectPath: string): Promise<{ bundlePath: string }> {
  const { loadProjectConfig } = await import("./config.js");
  const { captureEntry } = await import("./capture.js");
  const { emitBundle } = await import("./emit/bundle.js");
  const config = await loadProjectConfig(projectPath);
  const captured = await captureEntry(config);
  const bundlePath = await emitBundle(config, captured.root);
  return { bundlePath };
}
