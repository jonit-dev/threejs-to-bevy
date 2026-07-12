import type { ScriptContext } from "../script-context.js";

/** Compile-only parity fixture for the portable command and event surface. */
export function compileScriptContextCommands(context: ScriptContext): void {
  context.commands.despawn("orb");
  context.events.emit("match.win", { collected: 0 });
}
