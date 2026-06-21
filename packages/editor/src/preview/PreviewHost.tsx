import type { IPreviewState } from "./previewState.js";
import { createPreviewState } from "./previewState.js";

export interface IPreviewHostProps {
  state?: Partial<IPreviewState>;
}

export function PreviewHost({ state: input }: IPreviewHostProps) {
  const state = createPreviewState(input);
  return (
    <section className="tn-editor-preview-host" aria-label="Runtime preview">
      <h2>Runtime Preview</h2>
      {state.status === "empty" ? <p>No bundle built.</p> : null}
      {state.status === "building" ? <p>Building preview bundle.</p> : null}
      {state.status === "ready" ? <p>Ready: {state.bundlePath}</p> : null}
      {state.status === "error" ? (
        <ul>
          {state.diagnostics.map((diagnostic) => (
            <li key={`${diagnostic.code}:${diagnostic.path ?? diagnostic.message}`}>{diagnostic.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
