import type { ReactNode } from "react";

export interface IPanelShellProps {
  children: ReactNode;
  meta?: string;
  title: string;
}

export function PanelShell({ children, meta, title }: IPanelShellProps) {
  return (
    <section className="tn-editor-panel" aria-label={title}>
      <header className="tn-editor-panel__header">
        <h2>{title}</h2>
        {meta === undefined ? null : <span>{meta}</span>}
      </header>
      <div className="tn-editor-panel__body">{children}</div>
    </section>
  );
}
