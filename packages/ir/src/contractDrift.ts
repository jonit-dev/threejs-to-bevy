import ts from "typescript";

export interface IContractSurface {
  fields: ReadonlySet<string>;
  source: string;
}

export interface IEnumContractSurface {
  source: string;
  values: ReadonlySet<string>;
}

export interface IRustFieldType {
  source: string;
  type: string;
}

export interface IContractDriftDiagnostic {
  document: string;
  field: string;
  message: string;
  representation: string;
  source: string;
}

export function requiredFieldsFromJsonSchema(schema: unknown, source: string): IContractSurface {
  const required = isRecord(schema) && Array.isArray(schema.required) ? schema.required.filter((field): field is string => typeof field === "string") : [];
  return { fields: new Set(required), source };
}

export function optionalFieldsFromJsonSchema(schema: unknown, source: string): IContractSurface {
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return { fields: new Set(), source };
  }
  const required = requiredFieldsFromJsonSchema(schema, source).fields;
  const fields = new Set(Object.keys(schema.properties).filter((field) => !required.has(field)));
  return { fields, source };
}

export function enumValuesFromJsonSchema(schema: unknown, path: readonly string[], source: string): IEnumContractSurface {
  let node: unknown = schema;
  for (const segment of path) {
    if (segment === "items") {
      node = isRecord(node) ? node.items : undefined;
      continue;
    }
    node = isRecord(node) && isRecord(node.properties) ? node.properties[segment] : undefined;
  }
  const values = isRecord(node) && Array.isArray(node.enum) ? node.enum.filter((value): value is string => typeof value === "string") : [];
  return { source, values: new Set(values) };
}

export function enumValuesFromTypeScriptTypeAlias(sourceText: string, typeName: string, source: string): IEnumContractSurface {
  const sourceFile = ts.createSourceFile(source, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: ts.TypeAliasDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (found === undefined) {
    throw new Error(`Could not find TypeScript type alias ${typeName} in ${source}.`);
  }
  return { source, values: new Set(stringLiteralsFromTypeNode(found.type)) };
}

export function requiredFieldsFromTypeScriptInterface(sourceText: string, interfaceName: string, source: string): IContractSurface {
  const sourceFile = ts.createSourceFile(source, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = findInterface(sourceFile, interfaceName);
  if (declaration === undefined) {
    throw new Error(`Could not find TypeScript interface ${interfaceName} in ${source}.`);
  }
  const fields = new Set<string>();
  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || member.questionToken !== undefined) {
      continue;
    }
    const name = propertyNameText(member.name);
    if (name !== undefined) {
      fields.add(name);
    }
  }
  return { fields, source };
}

export function optionalFieldsFromTypeScriptInterface(sourceText: string, interfaceName: string, source: string): IContractSurface {
  const sourceFile = ts.createSourceFile(source, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = findInterface(sourceFile, interfaceName);
  if (declaration === undefined) {
    throw new Error(`Could not find TypeScript interface ${interfaceName} in ${source}.`);
  }
  const fields = new Set<string>();
  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || member.questionToken === undefined) {
      continue;
    }
    const name = propertyNameText(member.name);
    if (name !== undefined) {
      fields.add(name);
    }
  }
  return { fields, source };
}

export function requiredFieldsFromRustStruct(sourceText: string, structName: string, source: string): IContractSurface {
  const body = rustStructBody(sourceText, structName, source);
  const fields = new Set<string>();
  let pendingDefault = false;
  let pendingRename: string | undefined;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("#[serde(") && /\bdefault\b/.test(line)) {
      pendingDefault = true;
    }
    const rename = line.match(/#\[serde\([^)]*rename\s*=\s*"([^"]+)"/);
    if (rename?.[1] !== undefined) {
      pendingRename = rename[1];
    }
    const field = line.match(/^pub\s+([A-Za-z_][A-Za-z0-9_]*):\s*([^,]+),/);
    if (field?.[1] === undefined || field[2] === undefined) {
      continue;
    }
    if (!field[2].includes("Option<") && !pendingDefault) {
      fields.add(pendingRename ?? snakeToCamel(field[1]));
    }
    pendingDefault = false;
    pendingRename = undefined;
  }
  return { fields, source };
}

export function optionalFieldsFromRustStruct(sourceText: string, structName: string, source: string): IContractSurface {
  const body = rustStructBody(sourceText, structName, source);
  const fields = new Set<string>();
  let pendingDefault = false;
  let pendingRename: string | undefined;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("#[serde(") && /\bdefault\b/.test(line)) {
      pendingDefault = true;
    }
    const rename = line.match(/#\[serde\([^)]*rename\s*=\s*"([^"]+)"/);
    if (rename?.[1] !== undefined) {
      pendingRename = rename[1];
    }
    const field = line.match(/^pub\s+([A-Za-z_][A-Za-z0-9_]*):\s*([^,]+),/);
    if (field?.[1] === undefined || field[2] === undefined) {
      continue;
    }
    if (field[2].includes("Option<") || pendingDefault) {
      fields.add(pendingRename ?? snakeToCamel(field[1]));
    }
    pendingDefault = false;
    pendingRename = undefined;
  }
  return { fields, source };
}

export function rustFieldTypeFromStruct(sourceText: string, structName: string, fieldName: string, source: string): IRustFieldType {
  const body = rustStructBody(sourceText, structName, source);
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    const field = line.match(/^pub\s+([A-Za-z_][A-Za-z0-9_]*):\s*([^,]+),/);
    if (field?.[1] === fieldName && field[2] !== undefined) {
      return { source, type: field[2].trim() };
    }
  }
  throw new Error(`Could not find Rust field ${structName}.${fieldName} in ${source}.`);
}

export function compareRequiredFields(input: {
  document: string;
  expected: IContractSurface;
  representation: string;
  actual: IContractSurface;
}): IContractDriftDiagnostic[] {
  const diagnostics: IContractDriftDiagnostic[] = [];
  for (const field of [...input.expected.fields].sort()) {
    if (!input.actual.fields.has(field)) {
      diagnostics.push({
        document: input.document,
        field,
        message: `${input.document}: ${input.representation} is missing required field '${field}' from ${input.expected.source}.`,
        representation: input.representation,
        source: input.actual.source,
      });
    }
  }
  for (const field of [...input.actual.fields].sort()) {
    if (!input.expected.fields.has(field)) {
      diagnostics.push({
        document: input.document,
        field,
        message: `${input.document}: ${input.representation} requires field '${field}' but ${input.expected.source} does not.`,
        representation: input.representation,
        source: input.actual.source,
      });
    }
  }
  return diagnostics;
}

export function compareOptionalFields(input: {
  document: string;
  expected: IContractSurface;
  representation: string;
  actual: IContractSurface;
}): IContractDriftDiagnostic[] {
  const diagnostics: IContractDriftDiagnostic[] = [];
  for (const field of [...input.expected.fields].sort()) {
    if (!input.actual.fields.has(field)) {
      diagnostics.push({
        document: input.document,
        field,
        message: `${input.document}: ${input.representation} is missing optional field '${field}' from ${input.expected.source}.`,
        representation: input.representation,
        source: input.actual.source,
      });
    }
  }
  for (const field of [...input.actual.fields].sort()) {
    if (!input.expected.fields.has(field)) {
      diagnostics.push({
        document: input.document,
        field,
        message: `${input.document}: ${input.representation} has optional field '${field}' but ${input.expected.source} does not.`,
        representation: input.representation,
        source: input.actual.source,
      });
    }
  }
  return diagnostics;
}

export function compareEnumValues(input: {
  actual: IEnumContractSurface;
  document: string;
  expected: IEnumContractSurface;
  field: string;
  representation: string;
}): IContractDriftDiagnostic[] {
  const diagnostics: IContractDriftDiagnostic[] = [];
  for (const value of [...input.expected.values].sort()) {
    if (!input.actual.values.has(value)) {
      diagnostics.push({
        document: input.document,
        field: input.field,
        message: `${input.document}: ${input.representation} is missing enum value '${value}' for '${input.field}' from ${input.expected.source}.`,
        representation: input.representation,
        source: input.actual.source,
      });
    }
  }
  for (const value of [...input.actual.values].sort()) {
    if (!input.expected.values.has(value)) {
      diagnostics.push({
        document: input.document,
        field: input.field,
        message: `${input.document}: ${input.representation} has enum value '${value}' for '${input.field}' but ${input.expected.source} does not.`,
        representation: input.representation,
        source: input.actual.source,
      });
    }
  }
  return diagnostics;
}

export function rejectUnmarkedRustStringEnum(input: {
  allowStringCatchAll?: string;
  document: string;
  field: string;
  rustField: IRustFieldType;
}): IContractDriftDiagnostic | undefined {
  if (input.rustField.type !== "String" || input.allowStringCatchAll !== undefined) {
    return undefined;
  }
  return {
    document: input.document,
    field: input.field,
    message: `${input.document}: Bevy loader uses String for closed enum '${input.field}' without an explicit registry catch-all exception.`,
    representation: "Bevy loader struct",
    source: input.rustField.source,
  };
}

function findInterface(sourceFile: ts.SourceFile, interfaceName: string): ts.InterfaceDeclaration | undefined {
  let found: ts.InterfaceDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function stringLiteralsFromTypeNode(node: ts.TypeNode): string[] {
  if (ts.isUnionTypeNode(node)) {
    return node.types.flatMap((child) => stringLiteralsFromTypeNode(child));
  }
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    return [node.literal.text];
  }
  return [];
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function rustStructBody(sourceText: string, structName: string, source: string): string {
  const match = new RegExp(`pub\\s+struct\\s+${structName}\\s*\\{`).exec(sourceText);
  if (match === null) {
    throw new Error(`Could not find Rust struct ${structName} in ${source}.`);
  }
  const start = match.index + match[0].length;
  let depth = 1;
  for (let index = start; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(start, index);
      }
    }
  }
  throw new Error(`Could not find end of Rust struct ${structName} in ${source}.`);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
