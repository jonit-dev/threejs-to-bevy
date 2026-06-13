import { renderBundle } from "../render.js";

declare global {
  interface Window {
    __THREENATIVE_READY__?: {
      canvas: { height: number; width: number };
      diagnostics: unknown[];
      ok: boolean;
    };
  }
}

const container = document.getElementById("app");
if (container === null) {
  throw new Error("Missing #app container.");
}

const params = new URLSearchParams(window.location.search);
const bundleUrl = params.get("bundle") ?? "/bundle";
const result = await renderBundle(bundleUrl, container, { bookmarkId: params.get("bookmark") ?? undefined });

window.__THREENATIVE_READY__ = {
  canvas: {
    height: result.canvas.height,
    width: result.canvas.width,
  },
  diagnostics: result.diagnostics,
  ok: result.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
};
