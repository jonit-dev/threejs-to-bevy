import { useEffect, useState } from "react";
import { overlayClient } from "./client.js";

export function App() {
  const [message, setMessage] = useState("Waiting for game state");
  useEffect(() => overlayClient.subscribe("overlay:snapshot", (snapshot) => setMessage(snapshot.message)), []);
  return <main className="overlay"><section aria-labelledby="overlay-title" className="panel"><p className="eyebrow">ThreeNative overlay</p><h1 id="overlay-title">Ready to customize</h1><p>{message}</p><button onClick={() => overlayClient.send("overlay:action", { action: "confirm" })}>Send action</button></section></main>;
}
