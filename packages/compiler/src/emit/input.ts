import type { IInputIr } from "@threenative/ir";

export function inputToIr(input: Omit<IInputIr, "schema" | "version">): IInputIr {
  return {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [...input.actions].sort((left, right) => left.id.localeCompare(right.id)),
    axes: [...input.axes].sort((left, right) => left.id.localeCompare(right.id)),
  };
}
