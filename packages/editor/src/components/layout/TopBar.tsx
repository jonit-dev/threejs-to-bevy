import type { EditorShellStatus } from "../../adapters/editorModel.js";

export interface ITopBarProps {
  projectName: string;
  status: EditorShellStatus;
}

export function TopBar({ projectName, status }: ITopBarProps) {
  return (
    <header className="tn-editor-topbar">
      <div>
        <span className="tn-editor-topbar__product">ThreeNative Editor</span>
        <strong>{projectName}</strong>
      </div>
      <span className={`tn-editor-status tn-editor-status--${status}`}>{status}</span>
    </header>
  );
}
