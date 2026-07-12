import React, { useState, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

declare global {
  interface Window {
    threenativeOverlayBridge?: {
      send(type: string, payload: Record<string, unknown>): boolean;
    };
  }
}

type Side = "white" | "black";

function relayPointer(event: ReactPointerEvent<HTMLElement>) {
  if ((event.target as HTMLElement).closest("button, [role='dialog']")) return;
  window.parent.dispatchEvent(new window.parent.PointerEvent(event.type, {
    bubbles: true,
    button: event.button,
    buttons: event.buttons,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
  }));
}

function CapturedCard({ label, tone }: { label: string; tone: Side }) {
  return (
    <section className="captured-card" aria-label={`${label} captured pieces`}>
      <p>{label}</p>
      <div className={`captured-pieces ${tone}`} aria-label="No captured pieces">
        <span>—</span>
      </div>
    </section>
  );
}

function Settings({ close }: { close(): void }) {
  const [sound, setSound] = useState(true);
  const [highlights, setHighlights] = useState(true);
  return (
    <div className="modal-shade" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="close" onClick={close} aria-label="Close settings">×</button>
        <p className="eyebrow">GAME OPTIONS</p>
        <h2 id="settings-title">Settings</h2>
        <label><span>Sound effects</span><input type="checkbox" checked={sound} onChange={() => setSound(!sound)} /></label>
        <label><span>Move highlights</span><input type="checkbox" checked={highlights} onChange={() => setHighlights(!highlights)} /></label>
        <button className="done" onClick={close}>Done</button>
      </section>
    </div>
  );
}

function GameHud({ side }: { side: Side }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const opponent = side === "white" ? "black" : "white";
  return (
    <main className="hud" onPointerDown={relayPointer} onPointerMove={relayPointer} onPointerUp={relayPointer}>
      <aside className="captured-stack">
        <CapturedCard label="Opponent captured" tone={side} />
        <CapturedCard label="You captured" tone={opponent} />
      </aside>
      <button className="settings-button" onClick={() => setSettingsOpen(true)}><span>⚙</span> Settings</button>
      {settingsOpen && <Settings close={() => setSettingsOpen(false)} />}
    </main>
  );
}

function SideChooser({ choose }: { choose(side: Side): void }) {
  return (
    <main className="screen">
      <section className="card" aria-labelledby="side-title">
        <p className="eyebrow">NEW MATCH</p>
        <h1 id="side-title">Choose your side</h1>
        <p className="subtitle">Face a strategic AI opponent</p>
        <div className="choices">
          <button className="choice ivory" onClick={() => choose("white")}><span className="piece">♔</span><span><strong>Play White</strong><small>You move first</small></span></button>
          <button className="choice obsidian" onClick={() => choose("black")}><span className="piece">♚</span><span><strong>Play Black</strong><small>AI moves first</small></span></button>
        </div>
        <p className="hint">Keyboard: W for White · B for Black</p>
      </section>
    </main>
  );
}

function App() {
  const [side, setSide] = useState<Side>();
  const choose = (nextSide: Side) => {
    if (window.threenativeOverlayBridge?.send("chess:choose-side", { dismiss: false, side: nextSide })) setSide(nextSide);
  };
  return side === undefined ? <SideChooser choose={choose} /> : <GameHud side={side} />;
}

createRoot(document.getElementById("root")!).render(<App />);
