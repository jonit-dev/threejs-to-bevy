import { createOverlayClient } from "@threenative/overlay-client";
import { useEffect, useMemo, useState } from "react";
import type { ProjectGameToOverlayMessageMap, ProjectOverlayToGameMessageMap } from "../../../.threenative/types/project-context.js";

type Side = "white" | "black";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f1d493]";

function CapturedCard({ label, pieces, tone }: { label: string; pieces: string; tone: Side }) {
  return (
    <section className="min-h-24 rounded-lg border border-[#cda45b]/35 bg-[linear-gradient(145deg,rgba(17,14,10,.92),rgba(4,5,6,.84))] p-4 shadow-[0_12px_34px_rgba(0,0,0,.4)]" aria-label={`${label} captured pieces`}>
      <p className="mb-3 mt-0 font-serif text-sm text-[#d9d2c6]">{label}</p>
      <div className={`font-serif text-2xl tracking-[4px] ${tone === "white" ? "text-[#ead8b8]" : "text-[#70695f]"}`}>{pieces || "—"}</div>
    </section>
  );
}

function GameHud({ captures, side }: { captures: Record<Side, string>; side: Side }) {
  const opponent = side === "white" ? "black" : "white";
  return <main className="pointer-events-none grid min-h-dvh content-between gap-3 p-3">
    <CapturedCard label="Opponent captured" pieces={captures[side]} tone={side} />
    <CapturedCard label="You captured" pieces={captures[opponent]} tone={opponent} />
  </main>;
}

function SideChoice({ side, choose }: { side: Side; choose(side: Side): void }) {
  const white = side === "white";
  return <button className={`flex min-h-[122px] cursor-pointer items-center gap-3 rounded-[10px] border border-[#daad57]/30 bg-white/[.035] p-4 text-left text-[#f8f3e8] hover:border-[#e3b653] ${focusRing}`} onClick={() => choose(side)}>
    <span className={`w-14 text-center font-serif text-[54px] ${white ? "text-[#f1d493]" : "text-[#7d7569]"}`}>{white ? "♔" : "♚"}</span>
    <span><strong className="block">Play {white ? "White" : "Black"}</strong><small className="text-[#a9a39a]">{white ? "You move first" : "AI moves first"}</small></span>
  </button>;
}

function SideChooser({ choose }: { choose(side: Side): void }) {
  return <main className="fixed inset-0 grid place-items-center p-5" tabIndex={0} autoFocus onKeyDown={(event) => {
    if (event.key.toLowerCase() === "w") choose("white");
    if (event.key.toLowerCase() === "b") choose("black");
  }}>
    <section className="w-full max-w-[560px] rounded-[14px] border border-[#daad57]/60 bg-[linear-gradient(145deg,rgba(18,16,13,.94),rgba(5,7,9,.92))] p-7 text-center shadow-[0_28px_80px_rgba(0,0,0,.62)]" role="dialog" aria-modal="true" aria-labelledby="side-title">
      <p className="mb-2 mt-0 text-xs font-extrabold tracking-[.22em] text-[#d6aa55]">NEW MATCH</p>
      <h1 className="m-0 font-serif text-[clamp(30px,5vw,44px)] text-[#fff8e9]" id="side-title">Choose your side</h1>
      <p className="mb-6 mt-2 text-[#b9b3a9]">Face a strategic AI opponent</p>
      <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1"><SideChoice side="white" choose={choose} /><SideChoice side="black" choose={choose} /></div>
      <p className="mb-0 mt-5 text-xs text-[#777169]">Keyboard: W for White · B for Black</p>
    </section>
  </main>;
}

export function App() {
  const client = useMemo(() => createOverlayClient<ProjectGameToOverlayMessageMap, ProjectOverlayToGameMessageMap>(), []);
  const [side, setSide] = useState<Side>();
  const [captures, setCaptures] = useState<Record<Side, string>>({ black: "", white: "" });
  useEffect(() => client.subscribe("chess:captures", (payload) => {
    if (payload.playerSide !== "white" && payload.playerSide !== "black") return;
    setSide(payload.playerSide);
    setCaptures({ black: payload.black, white: payload.white });
    client.setInput("none");
  }), [client]);
  const choose = (nextSide: Side) => { client.send("chess:choose-side", { side: nextSide }); };
  return side === undefined ? <SideChooser choose={choose} /> : <GameHud captures={captures} side={side} />;
}
