import type { IWorkbenchProjectState } from "../../workbench/projectState.js";

export interface IProjectPanelProps {
  state: IWorkbenchProjectState;
}

export function ProjectPanel({ state }: IProjectPanelProps) {
  return (
    <section className="tn-editor-project-panel" aria-label="Project documents">
      {state.groups.map((group) => (
        <div key={group.kind}>
          <h3>{group.kind}</h3>
          <ul>
            {group.documents.map((document) => (
              <li key={document.path}>{document.path}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
