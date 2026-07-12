import type { IPrefabsIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { isRecord } from "./validationPrimitives.js";
import { validateEntityTags } from "./tagValidation.js";

export function validatePrefabs(prefabs: IPrefabsIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (prefabs.schema !== "threenative.prefabs" || prefabs.version !== "0.1.0") {
    diagnostics.push({ code: "TN_IR_PREFABS_VERSION_UNSUPPORTED", message: "Prefab catalog must use threenative.prefabs version 0.1.0.", path });
  }
  if (!Array.isArray(prefabs.prefabs)) {
    diagnostics.push({ code: "TN_IR_PREFABS_INVALID", message: "Prefab catalog prefabs must be an array.", path: `${path}/prefabs` });
    return;
  }
  const prefabIds = new Set<string>();
  prefabs.prefabs.forEach((prefab, prefabIndex) => {
    const prefabPath = `${path}/prefabs/${prefabIndex}`;
    if (!isRecord(prefab)) {
      diagnostics.push({ code: "TN_IR_PREFAB_INVALID", message: "Prefab declaration must be an object.", path: prefabPath });
      return;
    }
    if (typeof prefab.id !== "string" || prefab.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_PREFAB_ID_INVALID", message: "Prefab id must be a non-empty string.", path: `${prefabPath}/id` });
    } else if (prefabIds.has(prefab.id)) {
      diagnostics.push({ code: "TN_IR_PREFAB_ID_DUPLICATE", message: `Prefab '${prefab.id}' is duplicated.`, path: `${prefabPath}/id` });
    } else {
      prefabIds.add(prefab.id);
    }
    if (typeof prefab.root !== "string" || prefab.root.trim() === "") {
      diagnostics.push({ code: "TN_IR_PREFAB_ROOT_INVALID", message: "Prefab root must be a non-empty template entity id.", path: `${prefabPath}/root` });
    }
    if (!Array.isArray(prefab.entities) || prefab.entities.length === 0) {
      diagnostics.push({ code: "TN_IR_PREFAB_ENTITIES_EMPTY", message: "Prefab must declare at least one entity template.", path: `${prefabPath}/entities` });
      return;
    }
    const entityIds = new Set<string>();
    prefab.entities.forEach((entity, entityIndex) => {
      const entityPath = `${prefabPath}/entities/${entityIndex}`;
      if (typeof entity.id !== "string" || entity.id.trim() === "") {
        diagnostics.push({ code: "TN_IR_PREFAB_ENTITY_ID_INVALID", message: "Prefab entity template id must be non-empty.", path: `${entityPath}/id` });
      } else if (entityIds.has(entity.id)) {
        diagnostics.push({ code: "TN_IR_PREFAB_ENTITY_ID_DUPLICATE", message: `Prefab entity template '${entity.id}' is duplicated.`, path: `${entityPath}/id` });
      } else {
        entityIds.add(entity.id);
      }
      validateEntityTags(entity.tags, `${entityPath}/tags`, diagnostics);
      if (!isRecord(entity.components)) {
        diagnostics.push({ code: "TN_IR_PREFAB_COMPONENTS_INVALID", message: "Prefab entity components must be an object.", path: `${entityPath}/components` });
      }
    });
    if (typeof prefab.root === "string" && prefab.root.trim() !== "" && !entityIds.has(prefab.root)) {
      diagnostics.push({ code: "TN_IR_PREFAB_ROOT_MISSING", message: `Prefab root '${prefab.root}' is not declared in entities.`, path: `${prefabPath}/root` });
    }
    prefab.entities.forEach((entity, entityIndex) => {
      const hierarchy = entity.components?.Hierarchy;
      if (!isRecord(hierarchy) || hierarchy.parent === undefined) {
        return;
      }
      if (typeof hierarchy.parent !== "string" || hierarchy.parent.trim() === "" || !entityIds.has(hierarchy.parent)) {
        diagnostics.push({ code: "TN_IR_PREFAB_PARENT_MISSING", message: `Prefab entity '${entity.id}' references unknown parent '${String(hierarchy.parent)}'.`, path: `${prefabPath}/entities/${entityIndex}/components/Hierarchy/parent` });
      }
    });
    for (const entity of prefab.entities) {
      if (prefabHierarchyHasCycle(entity.id, prefab.entities)) {
        diagnostics.push({ code: "TN_IR_PREFAB_HIERARCHY_CYCLE", message: `Prefab '${String(prefab.id)}' contains a hierarchy cycle at '${entity.id}'.`, path: `${prefabPath}/entities` });
        break;
      }
    }
  });
}

function prefabHierarchyHasCycle(entityId: string, entities: IPrefabsIr["prefabs"][number]["entities"]): boolean {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const visited = new Set<string>();
  let current = entityId;
  while (true) {
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    const hierarchy = byId.get(current)?.components.Hierarchy;
    if (!isRecord(hierarchy) || typeof hierarchy.parent !== "string") {
      return false;
    }
    current = hierarchy.parent;
  }
}
