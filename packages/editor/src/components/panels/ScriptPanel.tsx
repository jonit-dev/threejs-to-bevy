import { FileCode, Save } from "lucide-react";

import type { IEditorScriptSourceState } from "../../state/editorStore.js";

export function ScriptPanel({
  script,
  onBodyChange,
  onSave,
}: {
  onBodyChange: (body: string) => void;
  onSave: () => void;
  script: IEditorScriptSourceState;
}) {
  return (
    <div className="tn-editor-script-panel">
      <header>
        <span><FileCode aria-hidden="true" size={16} /> {script.path ?? "src/scripts/*.ts"}</span>
        <button disabled={script.path === undefined || script.loading} onClick={onSave} title="Save script source" type="button"><Save size={15} /></button>
      </header>
      <textarea
        aria-label="Script source"
        onChange={(event) => onBodyChange(event.currentTarget.value)}
        readOnly={script.path === undefined || script.loading}
        spellCheck={false}
        value={script.body ?? ""}
      />
      {script.diagnostics.length === 0 ? null : (
        <ul className="tn-editor-list">
          {script.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}:${index}`}>
              <span>{diagnostic.message}</span>
              <small>{diagnostic.code}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
