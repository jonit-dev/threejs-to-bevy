import { loadBundle } from "./loadBundle.js";
import { renderLoadedBundle, type IRenderOptions, type IRenderResult } from "./render.js";
import { loadSystemModule } from "./systems/moduleLoader.js";

export async function renderBundle(source: string, container: HTMLElement, options: IRenderOptions = {}): Promise<IRenderResult> {
  return renderLoadedBundle(await loadBundle(source), container, { ...options, systemModuleLoader: loadSystemModule });
}
