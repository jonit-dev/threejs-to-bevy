import { defineBehavior, Vector3 } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

interface HarborState {
  audioCue: string;
  batteries: number;
  batteryText: string;
  elapsed: number;
  lastFailReason: string;
  menu: string;
  objective: string;
  phase: "menu" | "dock" | "rooftop" | "failed" | "rescued";
  phaseLabel: string;
  progress: number;
  savedProgress: string;
  settingsMode: "standard" | "high-contrast";
  settingsOpen: boolean;
  status: string;
}

export const updateHarborRescue = defineBehavior(
  {
    id: "neon-harbor-loop",
    schedule: "fixedUpdate",
    resourceWrites: ["GameState"],
    writes: ["Transform"],
  },
  (context: ScriptContext): void => {
    const defaults: HarborState = {
      audioCue: "silent",
      batteries: 0,
      batteryText: "Battery 0/2",
      elapsed: 0,
      lastFailReason: "",
      menu: "Harbor Rescue - press movement to launch",
      objective: "Reach the rooftop beacon",
      phase: "menu",
      phaseLabel: "Menu",
      progress: 0,
      savedProgress: "slot.main: dock",
      settingsMode: "standard",
      settingsOpen: false,
      status: "Menu: choose rescue route",
    };

    const player = context.entity("player");
    if (player !== undefined) {
      const transform = player.transform();
      const position = transform.position;
      const moveX = context.input.getAxis("MoveX");
      const moveY = context.input.getAxis("MoveY");
      const speed = 2.8;
      transform.position = Vector3.add(position, [
        moveX * context.time.fixedDelta * speed,
        0,
        moveY * context.time.fixedDelta * speed,
      ]);
    }

    const previous = context.resources.get("GameState", defaults) as HarborState;
    const actionPressed = (id: string): boolean =>
      context.input.getButtonDown(id) || context.input.getButton(id) || context.input.pressed(id);
    const settingsPressed = actionPressed("settings") || actionPressed("keyboard.KeyM") || actionPressed("KeyM");
    const retryPressed = actionPressed("retry") || actionPressed("keyboard.KeyR") || actionPressed("KeyR");
    const next: HarborState = {
      ...defaults,
      ...previous,
      elapsed: previous.elapsed + context.time.fixedDelta,
    };

    if (settingsPressed) {
      next.settingsOpen = !previous.settingsOpen;
      next.settingsMode = next.settingsOpen ? "high-contrast" : "standard";
    }

    if (retryPressed) {
      next.elapsed = 0.45;
      next.phase = "dock";
      next.progress = 0;
      next.batteries = 0;
      next.lastFailReason = "Recovered with retry";
    }

    if (next.phase !== "failed" && next.phase !== "rescued") {
      if (next.elapsed < 1.0) {
        next.phase = "menu";
        next.progress = 0;
      } else if (next.elapsed < 2.5) {
        next.phase = "dock";
        next.progress = 1;
      } else if (next.elapsed < 15.0) {
        next.phase = "rooftop";
        next.progress = 2;
      } else {
        next.phase = "failed";
        next.progress = 2;
        next.lastFailReason = "Rescue timer expired";
      }
    }

    next.batteries = next.progress >= 2 ? 2 : next.progress >= 1 ? 1 : 0;
    next.batteryText = `Battery ${next.batteries}/2`;
    next.phaseLabel = next.phase === "dock"
      ? "Phase 1: Dock"
      : next.phase === "rooftop"
        ? "Phase 2: Rooftop"
        : next.phase === "failed"
          ? "Retry"
          : next.phase === "rescued"
            ? "Rescued"
            : "Menu";
    next.audioCue = next.phase === "failed" ? "alarm" : next.batteries > previous.batteries ? "goal-ping" : "harbor-loop";
    next.savedProgress = `slot.main: ${next.phase}:${next.batteries}`;
    next.objective = next.phase === "rooftop" ? "Signal the rooftop beacon" : "Collect dock batteries";
    next.status = next.settingsOpen
      ? `Settings ${next.settingsMode}`
      : next.phase === "failed"
        ? "Retry with KeyR"
        : `${next.phaseLabel} - ${next.objective}`;

    context.resources.set("GameState", next);
  },
);
