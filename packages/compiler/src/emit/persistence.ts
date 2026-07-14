import type { ILocalDataIr } from "@threenative/ir";
import type { IPersistenceDeclaration } from "@threenative/sdk";

export function emitPersistence(persistence: IPersistenceDeclaration): ILocalDataIr {
  return {
    schema: "threenative.local-data",
    version: persistence.migration?.transforms === undefined ? "0.1.0" : "0.2.0",
    ...(persistence.autosave === undefined
      ? {}
      : {
          autosave: {
            ...(persistence.autosave.checkpointEvents === undefined ? {} : { checkpointEvents: [...persistence.autosave.checkpointEvents] }),
            debounceMs: persistence.autosave.debounceMs,
            ...(persistence.autosave.intervalSeconds === undefined ? {} : { intervalSeconds: persistence.autosave.intervalSeconds }),
          },
        }),
    components: persistence.components.map((component) => ({ id: component.id, schema: component.schema })),
    ...(persistence.migration === undefined
      ? {}
      : {
          migration: {
            currentVersion: persistence.migration.currentVersion,
            migrators: [...persistence.migration.migrators],
            ...(persistence.migration.transforms === undefined
              ? {}
              : {
                  transforms: persistence.migration.transforms.map((transform) => ({
                    fromVersion: transform.fromVersion,
                    operations: transform.operations.map((operation) => ({ ...operation })),
                  })),
                }),
          },
        }),
    resources: persistence.resources.map((resource) => ({ id: resource.id, schema: resource.schema })),
    saveSlots: persistence.saveSlots.map((slot) => ({
      appVersion: slot.appVersion,
      id: slot.id,
      schemaVersion: slot.schemaVersion,
    })),
    settings: persistence.settings.map((setting) => ({
      defaultValue: setting.defaultValue,
      ...(setting.enumValues === undefined ? {} : { enumValues: [...setting.enumValues] }),
      group: setting.group,
      key: setting.key,
      kind: setting.kind,
      ...(setting.max === undefined ? {} : { max: setting.max }),
      ...(setting.min === undefined ? {} : { min: setting.min }),
    })),
  };
}
