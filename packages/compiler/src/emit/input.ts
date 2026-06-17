import { sortedPersistedBindingOverrides, type IInputIr } from "@threenative/ir";

export function inputToIr(input: Omit<IInputIr, "schema" | "version">): IInputIr {
  return {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [...input.actions].sort((left, right) => left.id.localeCompare(right.id)),
    axes: [...input.axes].sort((left, right) => left.id.localeCompare(right.id)),
    ...(input.controlsSettings === undefined
      ? {}
      : {
          controlsSettings: {
            profileId: input.controlsSettings.profileId,
            rows: [...input.controlsSettings.rows].sort((left, right) => `${left.kind}:${left.actionOrAxisId}:${left.axisSlot ?? ""}`.localeCompare(`${right.kind}:${right.actionOrAxisId}:${right.axisSlot ?? ""}`)),
          },
        }),
    ...(input.persistedBindingOverrides === undefined
      ? {}
      : { persistedBindingOverrides: sortedPersistedBindingOverrides(input.persistedBindingOverrides) }),
  };
}
