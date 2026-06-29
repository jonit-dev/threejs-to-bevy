import { Check, Send, X } from "lucide-react";

import { useEditorStore } from "../../state/editorStore.js";

export function ChatPanel() {
  const chat = useEditorStore((state) => state.chat);
  const projectRevision = useEditorStore((state) => state.project?.projectRevision);
  const requestChatPlan = useEditorStore((state) => state.requestChatPlan);
  const applyChatPlan = useEditorStore((state) => state.applyChatPlan);
  const rejectChatPlan = useEditorStore((state) => state.rejectChatPlan);
  const setChatDraft = useEditorStore((state) => state.setChatDraft);
  const pendingPlan = chat.pendingPlan;
  const hasPlanErrors = (pendingPlan?.diagnostics ?? []).some((diagnostic) => diagnostic.severity === "error");
  const revisionChanged = pendingPlan?.projectRevision !== undefined && projectRevision !== undefined && pendingPlan.projectRevision !== projectRevision;
  const canApply = pendingPlan !== undefined && pendingPlan.ok && !hasPlanErrors && !revisionChanged && chat.status !== "applying";
  return (
    <section className="tn-editor-chat-panel" aria-label="AI chat ECS control">
      <div className="tn-editor-chat-panel__transcript" aria-live="polite">
        {chat.transcript.length === 0 ? (
          <p className="tn-editor-empty">Ask for a source-backed ECS change.</p>
        ) : (
          chat.transcript.map((entry) => (
            <article className={`tn-editor-chat-message tn-editor-chat-message--${entry.role}`} key={entry.id}>
              <small>{entry.role}</small>
              <p>{entry.text}</p>
            </article>
          ))
        )}
      </div>
      <form
        className="tn-editor-chat-panel__form"
        onSubmit={(event) => {
          event.preventDefault();
          void requestChatPlan(chat.draft);
        }}
      >
        <textarea aria-label="AI chat message" onChange={(event) => setChatDraft(event.target.value)} placeholder="Add a dynamic physics cube in front of the camera" value={chat.draft} />
        <button disabled={chat.status === "planning" || chat.draft.trim().length === 0} title="Plan source-backed ECS operations" type="submit">
          <Send size={15} /> Plan
        </button>
      </form>
      {pendingPlan === undefined ? null : (
        <div className="tn-editor-chat-plan" aria-label="AI chat operation plan">
          <header>
            <strong>{pendingPlan.ok ? "Proposed Plan" : "Plan Blocked"}</strong>
            <small>{pendingPlan.operations.length} operations</small>
          </header>
          <p>{pendingPlan.summary}</p>
          {pendingPlan.operations.length > 0 ? (
            <ol>
              {pendingPlan.operations.map((operation, index) => (
                <li key={`${operation.name}:${index}`}>
                  <code>{operation.name}</code>
                  <small>{operation.description}</small>
                </li>
              ))}
            </ol>
          ) : null}
          {pendingPlan.affectedFiles.length > 0 ? <small className="tn-editor-chat-plan__files">Files: {pendingPlan.affectedFiles.join(", ")}</small> : null}
          {pendingPlan.diagnostics.length > 0 || revisionChanged ? (
            <ul className="tn-editor-chat-diagnostics">
              {revisionChanged ? <li>Project revision changed after this plan was created.</li> : null}
              {pendingPlan.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}:${index}`}>{diagnostic.message}</li>)}
            </ul>
          ) : null}
          <div className="tn-editor-chat-plan__actions">
            <button disabled={!canApply} onClick={() => void applyChatPlan()} title="Apply approved source operations" type="button"><Check size={15} /> Apply</button>
            <button onClick={rejectChatPlan} title="Reject plan" type="button"><X size={15} /> Reject</button>
          </div>
        </div>
      )}
      {chat.applyResult === undefined ? null : (
        <div className="tn-editor-chat-result" aria-label="AI chat apply result">
          <strong>{chat.applyResult.ok ? "Applied" : "Apply Failed"}</strong>
          <small>Live update: {chat.applyResult.liveUpdate.kind}</small>
          <small>Changed: {chat.applyResult.changedSourceFiles.join(", ") || "none"}</small>
          {chat.applyResult.diagnostics.length > 0 ? (
            <ul className="tn-editor-chat-diagnostics">
              {chat.applyResult.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}:${index}`}>{diagnostic.message}</li>)}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
