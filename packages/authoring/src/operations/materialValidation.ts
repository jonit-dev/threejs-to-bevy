import type { IAuthoringDiagnostic } from "../diagnostics.js";
import {
  materialDocumentKeys,
  materialDocumentSchema,
  materialKeys,
  readString,
  supportedMaterialAlphaModes,
} from "../schemas.js";
import { typeDiagnostic, validateGeneratedPathString } from "./validationHelpers.js";

const materialTextureKeys = [
  "baseColorTexture",
  "clearcoatRoughnessTexture",
  "clearcoatTexture",
  "emissiveTexture",
  "metallicRoughnessTexture",
  "normalTexture",
  "occlusionTexture",
  "transmissionTexture",
] as const;

const materialFiniteNumberKeys = [
  "alphaCutoff",
  "clearcoat",
  "clearcoatRoughness",
  "emissiveIntensity",
  "metalness",
  "opacity",
  "roughness",
  "transmission",
] as const;

const materialNormalizedNumberKeys = [
  "alphaCutoff",
  "clearcoat",
  "clearcoatRoughness",
  "metalness",
  "opacity",
  "roughness",
  "transmission",
] as const;

const materialKinds = new Set(["extended", "shader", "standard"]);

interface IDeclarationDocumentValidationOptions {
  declarationKeys: ReadonlySet<string>;
  duplicateKind: string;
  expectedSchema: string;
  idKind: string;
  listName: string;
  rootKeys: ReadonlySet<string>;
  validateRoot?: (diagnostics: IAuthoringDiagnostic[]) => void;
  validateItem?: (diagnostics: IAuthoringDiagnostic[], path: string, item: Record<string, unknown>) => void | Promise<void>;
}

type ValidateDeclarationDocument = (
  file: string,
  data: unknown,
  options: IDeclarationDocumentValidationOptions,
) => Promise<IAuthoringDiagnostic[]>;

export function validateMaterialDocument(
  file: string,
  data: unknown,
  validateDeclarationDocument: ValidateDeclarationDocument,
): Promise<IAuthoringDiagnostic[]> {
  return validateDeclarationDocument(file, data, {
    declarationKeys: materialKeys,
    duplicateKind: "material",
    expectedSchema: materialDocumentSchema,
    idKind: "material document",
    listName: "materials",
    rootKeys: materialDocumentKeys,
    validateItem: (diagnostics, path, item) => validateMaterialDeclaration(diagnostics, file, path, item),
  });
}

function validateMaterialDeclaration(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  item: Record<string, unknown>,
): void {
  validateGeneratedPathString(diagnostics, file, `${path}/asset`, item.asset, "material asset must be a non-empty source path.");
  const kind = readString(item.kind);
  if (item.kind !== undefined && (kind === undefined || !materialKinds.has(kind))) {
    diagnostics.push(typeDiagnostic(file, `${path}/kind`, "material kind must be 'standard', 'extended', or 'shader'.", item.kind));
  }
  if (kind === "shader" && item.program === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/program`, "shader material must declare a portable program.", item.program));
  }
  if (item.color !== undefined && readString(item.color) === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/color`, "material color must be a non-empty string.", item.color));
  }
  if (item.emissive !== undefined && readString(item.emissive) === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/emissive`, "material emissive color must be a non-empty string.", item.emissive));
  }
  const alphaMode = readString(item.alphaMode);
  if (item.alphaMode !== undefined && (alphaMode === undefined || !supportedMaterialAlphaModes.has(alphaMode))) {
    diagnostics.push(typeDiagnostic(file, `${path}/alphaMode`, "material alphaMode must be 'opaque', 'mask', or 'blend'.", item.alphaMode));
  }
  for (const key of materialTextureKeys) {
    if (item[key] !== undefined && readString(item[key]) === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `material ${key} must be a non-empty asset id string.`, item[key]));
    }
  }
  for (const key of materialFiniteNumberKeys) {
    if (item[key] !== undefined && (typeof item[key] !== "number" || !Number.isFinite(item[key]))) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `material ${key} must be a finite number.`, item[key]));
    }
  }
  for (const key of materialNormalizedNumberKeys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value) && (value < 0 || value > 1)) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `material ${key} must be between 0 and 1.`, value));
    }
  }
  if (typeof item.emissiveIntensity === "number" && Number.isFinite(item.emissiveIntensity) && item.emissiveIntensity < 0) {
    diagnostics.push(typeDiagnostic(file, `${path}/emissiveIntensity`, "material emissiveIntensity must be non-negative.", item.emissiveIntensity));
  }
  for (const key of ["inputs", "outputs", "textures", "uniforms"] as const) {
    if (item[key] !== undefined && !Array.isArray(item[key])) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `material ${key} must be an array.`, item[key]));
    }
  }
  if (item.program !== undefined && (typeof item.program !== "object" || item.program === null || Array.isArray(item.program))) {
    diagnostics.push(typeDiagnostic(file, `${path}/program`, "material program must be an object.", item.program));
  }
}
