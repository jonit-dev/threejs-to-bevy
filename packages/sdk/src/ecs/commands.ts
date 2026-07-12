import type { EcsFactory, IEcsSchema } from "./schema.js";

export type EntityRef = string;

export type CommandDeclaration =
  | {
      kind: "addComponent" | "removeComponent" | "setComponent";
      component: string;
      entity: EntityRef;
      schema?: IEcsSchema;
    }
  | {
      components: string[];
      entity: EntityRef;
      kind: "spawn";
      schemas: IEcsSchema[];
    }
  | {
      entity: EntityRef;
      kind: "despawn";
      tag?: string;
    }
  | {
      kind: "despawn";
      tag: string;
    }
  | {
      kind: "instantiate";
      prefab: string;
      prefix: string;
    }
  | {
      child: EntityRef;
      kind: "setParent";
      parent: EntityRef;
    }
  | {
      child: EntityRef;
      kind: "clearParent";
    }
  | {
      event: string;
      kind: "emitEvent";
      schema?: IEcsSchema;
    }
  | {
      entity: EntityRef;
      kind: "tween";
      property: "emissiveIntensity" | "opacity" | "position" | "rotation" | "scale";
    }
  | {
      entity: EntityRef;
      kind: "worldText";
    };

export function spawn(entity: EntityRef, components: ReadonlyArray<EcsFactory | IEcsSchema | string> = []): CommandDeclaration {
  return {
    components: normalizeNames(components),
    entity,
    kind: "spawn",
    schemas: normalizeSchemas(components),
  };
}

export function despawn(entity: EntityRef): CommandDeclaration {
  return {
    entity,
    kind: "despawn",
  };
}

export function despawnByTag(tag: string): CommandDeclaration {
  return {
    kind: "despawn",
    tag,
  };
}

export function instantiate(prefab: string, prefix: string): CommandDeclaration {
  return { kind: "instantiate", prefab, prefix };
}

export function setParent(child: EntityRef, parent: EntityRef): CommandDeclaration {
  return { child, kind: "setParent", parent };
}

export function clearParent(child: EntityRef): CommandDeclaration {
  return { child, kind: "clearParent" };
}

export function addComponent(entity: EntityRef, component: EcsFactory | IEcsSchema | string): CommandDeclaration {
  return componentCommand("addComponent", entity, component);
}

export function removeComponent(entity: EntityRef, component: EcsFactory | IEcsSchema | string): CommandDeclaration {
  return componentCommand("removeComponent", entity, component);
}

export function setComponent(entity: EntityRef, component: EcsFactory | IEcsSchema | string): CommandDeclaration {
  return componentCommand("setComponent", entity, component);
}

export function emitEvent(event: EcsFactory | IEcsSchema | string): CommandDeclaration {
  return {
    event: normalizeName(event),
    kind: "emitEvent",
    schema: normalizeSchema(event),
  };
}

export function tween(entity: EntityRef, property: "emissiveIntensity" | "opacity" | "position" | "rotation" | "scale"): CommandDeclaration {
  return { entity, kind: "tween", property };
}

export function worldText(entity: EntityRef): CommandDeclaration {
  return { entity, kind: "worldText" };
}

function componentCommand(
  kind: "addComponent" | "removeComponent" | "setComponent",
  entity: EntityRef,
  component: EcsFactory | IEcsSchema | string,
): CommandDeclaration {
  return {
    component: normalizeName(component),
    entity,
    kind,
    schema: normalizeSchema(component),
  };
}

function normalizeNames(values: ReadonlyArray<EcsFactory | IEcsSchema | string>): string[] {
  return [...new Set(values.map(normalizeName))].sort();
}

function normalizeName(value: EcsFactory | IEcsSchema | string): string {
  return typeof value === "string" ? value : value.name;
}

function normalizeSchemas(values: ReadonlyArray<EcsFactory | IEcsSchema | string>): IEcsSchema[] {
  return values.flatMap((value) => {
    const schema = normalizeSchema(value);
    return schema === undefined ? [] : [schema];
  });
}

function normalizeSchema(value: EcsFactory | IEcsSchema | string): IEcsSchema | undefined {
  return typeof value === "string" ? undefined : value;
}
