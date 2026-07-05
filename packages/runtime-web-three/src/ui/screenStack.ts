import type { IUiIr, IUiScreenIr } from "@threenative/ir";

export interface IUiScreenStackTraceInput {
  events?: Array<{ kind: "pop" } | { focus?: string; kind: "push" | "replace"; screen: string }>;
  initialFocus?: string;
}

export interface IUiScreenStackTrace {
  active: string[];
  events: Array<{ focus?: string; kind: "focus" | "pop" | "push" | "replace"; screen?: string }>;
  finalFocus?: string;
  initialFocus?: string;
}

export function traceUiScreenStack(ui: IUiIr, input: IUiScreenStackTraceInput = {}): IUiScreenStackTrace {
  const screens = new Map((ui.screens ?? []).map((screen) => [screen.id, screen]));
  const active = [...(ui.screenStack?.active ?? firstScreen(screens))];
  let focus = input.initialFocus ?? currentScreen(screens, active)?.focusScope?.entry;
  const initialFocus = focus;
  const focusHistory = new Map<string, string | undefined>();
  const events: IUiScreenStackTrace["events"] = [];

  for (const event of input.events ?? []) {
    if (event.kind === "pop") {
      const popped = active.pop();
      const restoredScreen = currentScreen(screens, active);
      if (restoredScreen?.focusScope?.restore === "previous") {
        focus = focusHistory.get(restoredScreen.id) ?? restoredScreen.focusScope.entry;
      } else {
        focus = restoredScreen?.focusScope?.entry;
      }
      events.push({ focus, kind: "pop", ...(popped === undefined ? {} : { screen: popped }) });
      continue;
    }

    const target = screens.get(event.screen);
    if (target === undefined) {
      continue;
    }
    const current = currentScreen(screens, active);
    if (current !== undefined) {
      focusHistory.set(current.id, focus);
    }
    if (event.kind === "replace") {
      active.splice(0, active.length, target.id);
    } else {
      active.push(target.id);
    }
    focus = event.focus ?? target.focusScope?.entry;
    events.push({ focus, kind: event.kind, screen: target.id });
  }

  return {
    active,
    events,
    finalFocus: focus,
    initialFocus,
  };
}

function firstScreen(screens: Map<string, IUiScreenIr>): string[] {
  const first = screens.keys().next().value as string | undefined;
  return first === undefined ? [] : [first];
}

function currentScreen(screens: Map<string, IUiScreenIr>, active: readonly string[]): IUiScreenIr | undefined {
  const id = active.at(-1);
  return id === undefined ? undefined : screens.get(id);
}
