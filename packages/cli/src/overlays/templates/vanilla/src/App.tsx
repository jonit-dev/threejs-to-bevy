import { sendOverlayMessage } from "./bridge.js";

export function App() {
  return <main className="overlay"><section aria-labelledby="overlay-title" className="panel"><p className="eyebrow">ThreeNative overlay</p><h1 id="overlay-title">Ready to customize</h1><p>This optional webview panel uses local compiled assets and explicit pointer input.</p><button onClick={() => sendOverlayMessage("overlay:action", { action: "confirm" })}>Send action</button></section></main>;
}
