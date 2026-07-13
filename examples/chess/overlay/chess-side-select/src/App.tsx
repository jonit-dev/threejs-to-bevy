import { createOverlayClient } from "@threenative/overlay-client";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ProjectGameToOverlayMessageMap, ProjectOverlayToGameMessageMap } from "../../../.threenative/types/project-context.js";

type Side = "white" | "black";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1d493]";

function relayPointer(event: ReactPointerEvent<HTMLElement>) {
  if ((event.target as HTMLElement).closest("button, [role='dialog']")) return;
  window.parent.dispatchEvent(new PointerEvent(event.type, {
    bubbles: true, button: event.button, buttons: event.buttons, clientX: event.clientX,
    clientY: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType,
  }));
}

function CapturedCard({ label, pieces, tone }: { label: string; pieces: string; tone: Side }) {
  const position = label === "Opponent captured" ? "top-[218px] max-[760px]:top-[190px]" : "bottom-6 max-[760px]:bottom-4";
  return (
    <section className={`absolute left-6 min-h-28 w-[252px] rounded-lg border border-[#cda45b]/35 bg-[linear-gradient(145deg,rgba(17,14,10,.92),rgba(4,5,6,.84))] p-4 shadow-[0_12px_34px_rgba(0,0,0,.4),inset_0_1px_rgba(255,255,255,.05)] backdrop-blur-[9px] max-[760px]:left-3 max-[760px]:min-h-[82px] max-[760px]:w-[165px] max-[760px]:p-3 ${position}`} aria-label={`${label} captured pieces`}>
      <p className="mb-4 mt-0 font-serif text-[15px] text-[#d9d2c6]">{label}</p>
      <div className={`flex min-h-[38px] items-center font-serif text-[28px] tracking-[5px] ${tone === "white" ? "text-[#ead8b8]" : "text-[#70695f]"}`} aria-label={pieces === "" ? "No captured pieces" : `${pieces.length} captured pieces`}>
        <span>{pieces || "—"}</span>
      </div>
    </section>
  );
}

function Settings({ close }: { close(): void }) {
  const [sound, setSound] = useState(true);
  const [highlights, setHighlights] = useState(true);
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/50 p-[max(1rem,env(safe-area-inset-top))_max(1rem,env(safe-area-inset-right))_max(1rem,env(safe-area-inset-bottom))_max(1rem,env(safe-area-inset-left))] backdrop-blur" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <section className="relative w-full max-w-[420px] rounded-xl border border-[#daad57]/60 bg-[linear-gradient(145deg,#17140f,#080909)] p-[30px] shadow-[0_30px_90px_#000]" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className={`absolute right-4 top-3 cursor-pointer border-0 bg-transparent text-[27px] text-[#aaa298] ${focusRing}`} onClick={close} aria-label="Close settings">×</button>
        <p className="mb-[7px] mt-0 text-xs font-extrabold tracking-[.22em] text-[#d6aa55]">GAME OPTIONS</p>
        <h2 className="mb-6 mt-0 font-serif text-[32px] text-[#fff8e9]" id="settings-title">Settings</h2>
        <label className="flex justify-between border-t border-white/10 py-[15px] text-[#d7d0c5]"><span>Sound effects</span><input className="accent-[#d6aa55]" type="checkbox" checked={sound} onChange={() => setSound(!sound)} /></label>
        <label className="flex justify-between border-t border-white/10 py-[15px] text-[#d7d0c5]"><span>Move highlights</span><input className="accent-[#d6aa55]" type="checkbox" checked={highlights} onChange={() => setHighlights(!highlights)} /></label>
        <button className={`mt-[22px] w-full cursor-pointer rounded-md border border-[#c99a43] bg-[#d6aa55] p-3 font-extrabold text-[#17120a] ${focusRing}`} onClick={close}>Done</button>
      </section>
    </div>
  );
}

function RestartIcon() {
  return <svg aria-hidden="true" className="h-7 w-7 shrink-0" fill="none" viewBox="0 0 24 24"><path d="M4.75 9A8 8 0 1 1 6.3 17.6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2"/><path d="M4.75 4.75V9h4.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2"/></svg>;
}

function SettingsIcon() {
  return <svg aria-hidden="true" className="h-7 w-7 shrink-0" fill="none" viewBox="0 0 24 24"><path d="M9.7 3.4h4.6l.55 2.05a7.5 7.5 0 0 1 1.4.82l2.05-.56 2.3 3.98-1.5 1.5q.08.4.08.81t-.08.81l1.5 1.5-2.3 3.98-2.05-.56a7.5 7.5 0 0 1-1.4.82l-.55 2.05H9.7l-.55-2.05a7.5 7.5 0 0 1-1.4-.82l-2.05.56-2.3-3.98 1.5-1.5A4 4 0 0 1 4.82 12q0-.41.08-.81l-1.5-1.5L5.7 5.71l2.05.56a7.5 7.5 0 0 1 1.4-.82z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function GameHud({ captures, restart, side }: { captures: Record<Side, string>; restart(): void; side: Side }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const opponent = side === "white" ? "black" : "white";
  useEffect(() => {
    const forwardKeyboard = (event: KeyboardEvent) => {
      if (document.querySelector("[role='dialog']") !== null) return;
      window.parent.dispatchEvent(new KeyboardEvent(event.type, { bubbles: true, code: event.code, key: event.key, location: event.location, repeat: event.repeat }));
    };
    window.addEventListener("keydown", forwardKeyboard); window.addEventListener("keyup", forwardKeyboard);
    return () => { window.removeEventListener("keydown", forwardKeyboard); window.removeEventListener("keyup", forwardKeyboard); };
  }, []);
  const actionButton = `group absolute right-6 flex h-[62px] w-[184px] cursor-pointer items-center gap-4 rounded-md border border-[#5b554d]/65 bg-[linear-gradient(180deg,rgba(37,38,36,.98),rgba(25,26,24,.98))] px-5 text-left text-[17px] font-medium text-[#f0ece5] shadow-[0_8px_22px_rgba(0,0,0,.38),inset_0_1px_rgba(255,255,255,.045)] transition duration-150 hover:-translate-y-px hover:border-[#81735c] hover:bg-[linear-gradient(180deg,rgba(47,47,43,.99),rgba(29,30,27,.99))] hover:shadow-[0_11px_28px_rgba(0,0,0,.5)] active:translate-y-0 active:bg-[#191a18] motion-reduce:transition-none max-[760px]:right-3 ${focusRing}`;
  return (
    <main className="relative min-h-dvh w-full p-[env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)]" onPointerDown={relayPointer} onPointerMove={relayPointer} onPointerUp={relayPointer}>
      <aside className="pointer-events-none absolute inset-0">
        <CapturedCard label="Opponent captured" pieces={captures[side]} tone={side} />
        <CapturedCard label="You captured" pieces={captures[opponent]} tone={opponent} />
      </aside>
      <button className={`${actionButton} bottom-[106px] max-[760px]:bottom-[90px]`} onClick={restart}><span className="text-[#aaa79f] transition-colors group-hover:text-[#d8b15d]"><RestartIcon /></span><span>New Game</span></button>
      <button className={`${actionButton} bottom-7 max-[760px]:bottom-4`} onClick={() => setSettingsOpen(true)}><span className="text-[#aaa79f] transition-colors group-hover:text-[#d8b15d]"><SettingsIcon /></span><span>Settings</span></button>
      {settingsOpen && <Settings close={() => setSettingsOpen(false)} />}
    </main>
  );
}

function SideChoice({ side, choose }: { side: Side; choose(side: Side): void }) {
  const white = side === "white";
  return (
    <button className={`flex min-h-[122px] cursor-pointer items-center gap-3.5 rounded-[10px] border border-[#daad57]/30 bg-white/[.035] p-[18px] text-left text-[#f8f3e8] transition hover:-translate-y-0.5 hover:border-[#e3b653] hover:bg-[#e3b653]/10 hover:shadow-[0_8px_28px_rgba(0,0,0,.34)] motion-reduce:transition-none max-[560px]:min-h-[88px] ${focusRing}`} onClick={() => choose(side)}>
      <span className={`w-14 text-center font-serif text-[54px] leading-none drop-shadow-[0_3px_5px_#000] ${white ? "text-[#f1d493]" : "text-[#7d7569] [text-shadow:0_1px_#c2a871]"}`}>{white ? "♔" : "♚"}</span>
      <span><strong className="block text-[17px]">Play {white ? "White" : "Black"}</strong><small className="mt-1 block text-xs text-[#a9a39a]">{white ? "You move first" : "AI moves first"}</small></span>
    </button>
  );
}

function SideChooser({ choose }: { choose(side: Side): void }) {
  return (
    <main className="fixed inset-0 grid place-items-center bg-black/45 p-[max(1.25rem,env(safe-area-inset-top))_max(1.25rem,env(safe-area-inset-right))_max(1.25rem,env(safe-area-inset-bottom))_max(1.25rem,env(safe-area-inset-left))] backdrop-blur-[2px]">
      <section className="w-full max-w-[560px] rounded-[14px] border border-[#daad57]/60 bg-[linear-gradient(145deg,rgba(18,16,13,.94),rgba(5,7,9,.92))] p-[30px] text-center shadow-[0_28px_80px_rgba(0,0,0,.62),inset_0_1px_rgba(255,255,255,.06)] backdrop-blur-[14px] max-[560px]:p-[22px]" role="dialog" aria-modal="true" aria-labelledby="side-title">
        <p className="mb-[7px] mt-0 text-xs font-extrabold tracking-[.22em] text-[#d6aa55]">NEW MATCH</p>
        <h1 className="m-0 font-serif text-[clamp(30px,5vw,44px)] font-semibold text-[#fff8e9]" id="side-title">Choose your side</h1>
        <p className="mb-6 mt-2 text-[#b9b3a9]">Face a strategic AI opponent</p>
        <div className="grid grid-cols-2 gap-3.5 max-[560px]:grid-cols-1"><SideChoice side="white" choose={choose} /><SideChoice side="black" choose={choose} /></div>
        <p className="mb-0 mt-5 text-xs text-[#777169]">Keyboard: W for White · B for Black</p>
      </section>
    </main>
  );
}

export function App() {
  const client = useMemo(() => createOverlayClient<ProjectGameToOverlayMessageMap, ProjectOverlayToGameMessageMap>(), []);
  const [side, setSide] = useState<Side>();
  const [captures, setCaptures] = useState<Record<Side, string>>({ black: "", white: "" });
  useEffect(() => client.subscribe("chess:captures", (payload) => {
    if (payload.playerSide !== "white" && payload.playerSide !== "black") return;
    setSide(payload.playerSide);
    setCaptures({ black: payload.black, white: payload.white });
    client.setInput("modal");
  }), [client]);
  const choose = (nextSide: Side) => { client.send("chess:choose-side", { side: nextSide }); };
  const restart = () => { client.send("chess:restart", {}); };
  return side === undefined ? <SideChooser choose={choose} /> : <GameHud captures={captures} restart={restart} side={side} />;
}
