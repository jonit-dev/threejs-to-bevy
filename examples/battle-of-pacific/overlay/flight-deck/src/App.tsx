import { useEffect, useState, type CSSProperties } from "react";
import { overlayClient, type FlightTelemetry, type RadarFrame } from "./client.js";

const initialTelemetry: FlightTelemetry = {
  airspeed: "140 KT",
  altitude: "295 FT",
  flaps: "UP",
  integrity: "100%",
  objective: "Hold controlled flight for 45 seconds",
  phase: "CRUISE",
  progress: 0,
  stall: false,
  throttle: "82%"
};

function Gauge({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="gauge" aria-label={`${label}: ${value}`}>
      <span className="gauge__ticks" aria-hidden="true" />
      <span className="gauge__label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}

const RADAR_RADIUS = 62;

function Radar({ frame }: { frame: RadarFrame | undefined }) {
  const range = frame?.rangeMeters ?? 1600;
  const contacts = Object.entries(frame?.contacts ?? {});
  return (
    <section className="radar" aria-label="Radar scope">
      <div className="radar__scope">
        <span className="radar__ring radar__ring--outer" />
        <span className="radar__ring radar__ring--inner" />
        <span className="radar__axis radar__axis--v" />
        <span className="radar__axis radar__axis--h" />
        <span className="radar__sweep" />
        <span className="radar__player" />
        {contacts.map(([id, contact]) => {
          const clamped = Math.min(1, contact.distance / range);
          const angle = (contact.bearingDeg * Math.PI) / 180;
          const x = Math.sin(angle) * clamped * RADAR_RADIUS;
          const y = -Math.cos(angle) * clamped * RADAR_RADIUS;
          const kindClass = contact.kind === "ship"
            ? "radar__blip--ship"
            : contact.kind === "friendly"
              ? "radar__blip--friendly"
              : "radar__blip--zero";
          const stateClass = contact.alive ? "" : " radar__blip--down";
          return (
            <span
              key={id}
              className={`radar__blip ${kindClass}${stateClass}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            />
          );
        })}
      </div>
      <div className="radar__caption">
        <span>RADAR</span>
        <b>{`HDG ${String(frame?.headingDeg ?? 0).padStart(3, "0")}°`}</b>
        <small>{`${((range) / 1000).toFixed(1)} KM`}</small>
      </div>
    </section>
  );
}

function Reticle() {
  return (
    <div className="reticle" aria-hidden="true">
      <span className="reticle__wing reticle__wing--left" />
      <span className="reticle__wing reticle__wing--right" />
      <span className="reticle__dot" />
      <span className="reticle__drop" />
    </div>
  );
}

export function App() {
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [radar, setRadar] = useState<RadarFrame | undefined>(undefined);

  useEffect(() => overlayClient.subscribe("flight:telemetry", setTelemetry), []);
  useEffect(() => overlayClient.subscribe("flight:radar", setRadar), []);
  useEffect(() => {
    const forwardKeyboard = (event: KeyboardEvent) => {
      window.parent.dispatchEvent(new KeyboardEvent(event.type, {
        bubbles: true,
        code: event.code,
        key: event.key,
        location: event.location,
        repeat: event.repeat
      }));
    };
    window.addEventListener("keydown", forwardKeyboard);
    window.addEventListener("keyup", forwardKeyboard);
    return () => {
      window.removeEventListener("keydown", forwardKeyboard);
      window.removeEventListener("keyup", forwardKeyboard);
    };
  }, []);

  const progress = Math.max(0, Math.min(1, telemetry.progress));
  const warning = telemetry.stall || telemetry.phase === "DITCHED";

  return (
    <main className={`flight-deck${warning ? " flight-deck--warning" : ""}`}>
      <header className="mission-strip">
        <div className="mission-strip__identity">
          <span className="wing-mark" aria-hidden="true">★</span>
          <div>
            <p>VB-6 · SBD-3</p>
            <strong>PACIFIC PATROL</strong>
          </div>
        </div>
        <div className="mission-strip__objective">
          <span>ORDERS</span>
          <p>{telemetry.objective}</p>
          <i style={{ "--progress": progress } as CSSProperties} />
        </div>
        <div className="phase-flag" role="status">
          <span className="phase-flag__lamp" />
          {telemetry.phase}
        </div>
      </header>

      <aside className="instrument-stack" aria-label="Flight instruments">
        <Gauge label="AIRSPEED" value={telemetry.airspeed} detail="INDICATED" />
        <Gauge label="ALTITUDE" value={telemetry.altitude} detail="SEA LEVEL" />
        <Gauge label="AIRFRAME" value={telemetry.integrity} detail="INTEGRITY" />
        <section className="engine-card">
          <div>
            <span>ENGINE</span>
            <strong>R-1820</strong>
          </div>
          <div className="engine-card__throttle">
            <span style={{ height: telemetry.throttle }} />
          </div>
          <b>{telemetry.throttle}</b>
        </section>
      </aside>

      <Reticle />

      <Radar frame={radar} />

      <section className="warning-panel" aria-live="assertive">
        <span>⚠</span>
        <div>
          <strong>{telemetry.phase === "DITCHED" ? "AIRCRAFT DOWN" : "STALL WARNING"}</strong>
          <small>{telemetry.phase === "DITCHED" ? "RESTART SORTIE" : "LOWER NOSE · ADD POWER"}</small>
        </div>
      </section>

      <footer className="control-rack">
        <div className="control-rack__keys">
          <span><kbd>W</kbd><kbd>S</kbd> PITCH</span>
          <span><kbd>A</kbd><kbd>D</kbd> ROLL</span>
          <span><kbd>Q</kbd><kbd>E</kbd> RUDDER</span>
          <span><kbd>⇧</kbd><kbd>⌃</kbd> THROTTLE</span>
        </div>
        <span
          style={{
            padding: "9px 10px",
            borderLeft: "3px solid #c9bc8b",
            color: "#eee2bd",
            background: "#091012d9",
            fontSize: "9px",
            fontWeight: 800,
            letterSpacing: ".11em"
          }}
        >
          PRESS ANY KEY · ENABLE SOUND
        </span>
        <button
          data-threenative-interactive
          className={telemetry.flaps === "DOWN" ? "is-active" : ""}
          onClick={() => overlayClient.send("flight:toggle-flaps", {})}
          type="button"
        >
          <span>F</span>
          FLAPS {telemetry.flaps}
        </button>
        <button
          data-threenative-interactive
          className="retry"
          onClick={() => overlayClient.send("flight:restart", {})}
          type="button"
        >
          <span>R</span>
          RETRY FLIGHT
        </button>
      </footer>
    </main>
  );
}
