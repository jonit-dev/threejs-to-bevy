import type { IPreviewSelectionTarget } from "./selectionBridge.js";

export function PreviewOverlay({ target }: { target?: IPreviewSelectionTarget }) {
  return <div className="tn-editor-preview-overlay">{target === undefined ? "Unmapped selection" : `Selected ${target.runtimeId}`}</div>;
}
