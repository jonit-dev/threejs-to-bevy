import React, { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

declare global {
  interface Window {
    threenativeOverlayBridge?: {
      send(type: string, payload: Record<string, unknown>): boolean;
      subscribe?(listener: (type: string, payload: Record<string, unknown>) => void): () => void;
    };
  }
}

type Side = "white" | "black";

type ChessGameSnapshot = {
  opponentCapturedText?: unknown;
  playerCapturedText?: unknown;
  playerSideText?: unknown;
};

type RuntimeWindow = Window & {
  __THREENATIVE_RUNTIME__?: {
    resourceSnapshot(id: string): unknown;
  };
};

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

function CapturedCard({ label, pieces, tone }: { label: string; pieces: string; tone: Side }) {
  return (
    <section className="captured-card" aria-label={`${label} captured pieces`}>
      <p>{label}</p>
      <div className={`captured-pieces ${tone}`} aria-label={pieces === "" ? "No captured pieces" : `${pieces.length} captured pieces`}>
        <span>{pieces || "—"}</span>
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

function GameHud({ captures, side }: { captures: Record<Side, string>; side: Side }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const opponent = side === "white" ? "black" : "white";
  useEffect(() => {
    const forwardKeyboard = (event: KeyboardEvent) => {
      if (document.querySelector("[role='dialog']") !== null) return;
      window.parent.dispatchEvent(new window.parent.KeyboardEvent(event.type, {
        bubbles: true,
        code: event.code,
        key: event.key,
        location: event.location,
        repeat: event.repeat,
      }));
    };
    window.addEventListener("keydown", forwardKeyboard);
    window.addEventListener("keyup", forwardKeyboard);
    return () => {
      window.removeEventListener("keydown", forwardKeyboard);
      window.removeEventListener("keyup", forwardKeyboard);
    };
  }, []);
  return (
    <main className="hud" onPointerDown={relayPointer} onPointerMove={relayPointer} onPointerUp={relayPointer}>
      <aside className="captured-stack">
        <CapturedCard label="Opponent captured" pieces={captures[side]} tone={side} />
        <CapturedCard label="You captured" pieces={captures[opponent]} tone={opponent} />
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
  const [captures, setCaptures] = useState<Record<Side, string>>({ black: "", white: "" });
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const applySnapshot = (payload: Record<string, unknown>) => {
      if (payload.playerSide !== "white" && payload.playerSide !== "black") return;
      if (typeof payload.black !== "string" || typeof payload.white !== "string") return;
      setSide(payload.playerSide);
      setCaptures({ black: payload.black, white: payload.white });
    };
    const connect = () => {
      unsubscribe?.();
      unsubscribe = window.threenativeOverlayBridge?.subscribe?.((type, payload) => {
        if (type === "chess:captures") applySnapshot(payload);
      });
    };
    connect();
    window.addEventListener("threenative:bridge-ready", connect);
    return () => {
      window.removeEventListener("threenative:bridge-ready", connect);
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    const syncGameResource = () => {
      const snapshot = (window.parent as RuntimeWindow).__THREENATIVE_RUNTIME__?.resourceSnapshot("ChessGame") as ChessGameSnapshot | undefined;
      const playerSide = typeof snapshot?.playerSideText === "string" ? snapshot.playerSideText.toLowerCase() : "";
      if (playerSide !== "white" && playerSide !== "black") return;
      if (typeof snapshot.playerCapturedText !== "string" || typeof snapshot.opponentCapturedText !== "string") return;
      const opponent = playerSide === "white" ? "black" : "white";
      setSide(playerSide);
      setCaptures({
        [opponent]: snapshot.playerCapturedText === "—" ? "" : snapshot.playerCapturedText,
        [playerSide]: snapshot.opponentCapturedText === "—" ? "" : snapshot.opponentCapturedText,
      } as Record<Side, string>);
    };
    syncGameResource();
    const interval = window.setInterval(syncGameResource, 100);
    return () => window.clearInterval(interval);
  }, []);
  const choose = (nextSide: Side) => {
    if (window.threenativeOverlayBridge?.send("chess:choose-side", { dismiss: false, side: nextSide })) setSide(nextSide);
  };
  return side === undefined ? <SideChooser choose={choose} /> : <GameHud captures={captures} side={side} />;
}

createRoot(document.getElementById("root")!).render(<App />);
