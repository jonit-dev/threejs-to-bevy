import { sendOverlayMessage } from "./bridge.js";

export function App() {
  return (
    <main className="pointer-events-none min-h-dvh p-[max(1rem,env(safe-area-inset-top))_max(1rem,env(safe-area-inset-right))_max(1rem,env(safe-area-inset-bottom))_max(1rem,env(safe-area-inset-left))] text-slate-100">
      <section aria-labelledby="overlay-title" className="pointer-events-auto ml-auto max-w-sm rounded-xl border border-white/20 bg-slate-950/90 p-5 shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">ThreeNative overlay</p>
        <h1 id="overlay-title" className="mt-1 text-2xl font-bold">Ready to customize</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">This optional webview panel uses local compiled assets and explicit pointer input.</p>
        <button className="mt-4 rounded-md bg-cyan-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 motion-reduce:transition-none" onClick={() => sendOverlayMessage("overlay:action", { action: "confirm" })}>Send action</button>
      </section>
    </main>
  );
}
