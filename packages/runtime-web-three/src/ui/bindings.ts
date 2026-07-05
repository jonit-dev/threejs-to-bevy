import type { IUiBinding, IWorldIr } from "@threenative/ir";

export function resolveUiBinding(binding: IUiBinding | undefined, world: IWorldIr): unknown {
  if (binding === undefined) {
    return undefined;
  }
  const source =
    binding.kind === "resource"
      ? world.resources?.[binding.name]
      : world.entities.find((entity) => entity.id === binding.entity)?.components[binding.component];
  if (binding.format !== undefined) {
    return formatBindingValue(binding.format, source, binding.fields ?? (binding.field === undefined ? [] : [binding.field]));
  }
  if (binding.field === undefined || source === undefined || source === null || typeof source !== "object") {
    return source;
  }
  return (source as Record<string, unknown>)[binding.field];
}

function formatBindingValue(format: string, source: unknown, fields: readonly string[]): string {
  const record = source !== undefined && source !== null && typeof source === "object" ? source as Record<string, unknown> : {};
  const allowed = fields.length === 0 ? undefined : new Set(fields);
  return format.replace(/\{([^{}]+)\}/g, (_match, token: string) => {
    const [field, formatter] = token.split(":");
    if (field === undefined || field.trim() === "" || (allowed !== undefined && !allowed.has(field))) {
      return "";
    }
    return formatScalar(record[field], formatter);
  });
}

function formatScalar(value: unknown, formatter: string | undefined): string {
  if (formatter === undefined) {
    return value === undefined || value === null ? "" : String(value);
  }
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  if (formatter.startsWith("fixed")) {
    return numeric.toFixed(Number(formatter.slice("fixed".length)));
  }
  if (formatter.startsWith("pad")) {
    return String(Math.trunc(numeric)).padStart(Number(formatter.slice("pad".length)), "0");
  }
  return String(value ?? "");
}
