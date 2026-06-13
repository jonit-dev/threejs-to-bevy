import type { IUiBinding, IWorldIr } from "@threenative/ir";

export function resolveUiBinding(binding: IUiBinding | undefined, world: IWorldIr): unknown {
  if (binding === undefined) {
    return undefined;
  }
  const source =
    binding.kind === "resource"
      ? world.resources?.[binding.name]
      : world.entities.find((entity) => entity.id === binding.entity)?.components[binding.component];
  if (binding.field === undefined || source === undefined || source === null || typeof source !== "object") {
    return source;
  }
  return (source as Record<string, unknown>)[binding.field];
}
