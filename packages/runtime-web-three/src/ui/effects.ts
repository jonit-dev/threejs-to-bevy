import type { IUiEffectPresetIr, IUiIr, IUiNodeIr } from "@threenative/ir";
import { resolveUiEffectStrategy } from "@threenative/ir/uiEffects";

export interface IUiEffectTrace {
  effects: IUiEffectTraceEntry[];
}

export interface IUiEffectTraceEntry {
  effect: string;
  kind: string;
  node: string;
  state: string;
  strategy: string;
}

export function traceUiEffects(ui: IUiIr, activeStates: readonly string[]): IUiEffectTrace {
  const states = new Set(activeStates);
  const effects: IUiEffectTraceEntry[] = [];
  collectUiEffectEntries(ui.root, states, effects);
  effects.sort((left, right) => `${left.node}:${left.effect}`.localeCompare(`${right.node}:${right.effect}`));
  return { effects };
}

function collectUiEffectEntries(node: IUiNodeIr, states: Set<string>, effects: IUiEffectTraceEntry[]): void {
  for (const effect of node.effects ?? []) {
    if (isEffectActive(effect, states)) {
      effects.push({
        effect: effect.id,
        kind: effect.kind,
        node: node.id,
        state: effect.trigger,
        strategy: resolveUiEffectStrategy(effect),
      });
    }
  }
  node.children?.forEach((child) => collectUiEffectEntries(child, states, effects));
}

function isEffectActive(effect: IUiEffectPresetIr, states: Set<string>): boolean {
  return effect.trigger === "predicate" || states.has(effect.trigger);
}
