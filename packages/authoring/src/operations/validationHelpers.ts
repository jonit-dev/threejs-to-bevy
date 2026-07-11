import { isGeneratedArtifactPath } from "../documents.js";
import { authoringDiagnostic, type IAuthoringDiagnostic, type IAuthoringDiagnosticFix } from "../diagnostics.js";
import { isRecord, readString } from "../schemas.js";

export function typeDiagnostic(file: string, path: string, message: string, value: unknown): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_SHAPE_INVALID",
    file,
    message,
    path,
    value,
  });
}

export function generatedPathDiagnostic(file: string, path: string, value: string): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
    file,
    message: "Generated bundle artifacts cannot be used as authoring source paths.",
    path,
    value,
    suggestion: "Reference durable source files instead of dist/game.bundle or scripts.bundle.js.",
  });
}

export function validateGeneratedPathString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  const sourcePath = readString(value);
  if (value !== undefined && sourcePath === undefined) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  } else if (sourcePath !== undefined && isGeneratedArtifactPath(sourcePath)) {
    diagnostics.push(generatedPathDiagnostic(file, path, sourcePath));
  }
}

export function schemaDocumentShapeFix(file: string, data: Record<string, unknown>): IAuthoringDiagnosticFix | undefined {
  const sourceSchema = readString(data.schema);
  if (sourceSchema !== "threenative.component-schemas" && sourceSchema !== "threenative.resource-schemas") {
    return undefined;
  }
  const kind = sourceSchema === "threenative.component-schemas" ? "component" : "resource";
  const rawSchemas = isRecord(data.schemas) ? data.schemas : {};
  const schemas = Object.entries(rawSchemas).sort(([left], [right]) => left.localeCompare(right)).map(([id, value]) => {
    const rawFields = isRecord(value) && isRecord(value.fields) ? value.fields : {};
    const fields = Object.fromEntries(Object.entries(rawFields).sort(([left], [right]) => left.localeCompare(right)).map(([fieldName, field]) => [fieldName, authoringSchemaField(field)]));
    return {
      id,
      fields: Object.keys(fields).length === 0 ? { value: { kind: "json" } } : fields,
    };
  });
  return {
    docs: "docs/contracts/authoring-source-documents.md",
    instruction: `Replace '${file}' with this full structured ${kind} schema document. Keep the array shape under 'schemas' and replace placeholder fields with the fields used by the declaration.`,
    snippet: JSON.stringify({
      schema: "threenative.schema",
      version: "0.1.0",
      id: readString(data.id) ?? `${kind}-schemas`,
      kind,
      schemas,
    }, null, 2),
  };
}

function authoringSchemaField(value: unknown): Record<string, unknown> {
  const field = isRecord(value) ? value : {};
  const rawKind = readString(field.kind) ?? readString(field.type);
  const kind = ["boolean", "color", "enum", "json", "number", "quat", "string", "vec2", "vec3", "vec4"].includes(rawKind ?? "") ? rawKind : "json";
  return {
    kind,
    ...(field.required === true ? { required: true } : {}),
    ...(Object.prototype.hasOwnProperty.call(field, "default") ? { default: field.default } : {}),
  };
}
