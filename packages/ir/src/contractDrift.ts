import ts from "typescript";

export interface IContractSurface {
  fields: ReadonlySet<string>;
  source: string;
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

export function requiredFieldsFromRustStruct(sourceText: string, structName: string, source: string): IContractSurface {
  const body = rustStructBody(sourceText, structName, source);
  const fields = new Set<string>();
  let pendingRename: string | undefined;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    const rename = line.match(/#\[serde\([^)]*rename\s*=\s*"([^"]+)"/);
    if (rename?.[1] !== undefined) {
      pendingRename = rename[1];
    }
    const field = line.match(/^pub\s+([A-Za-z_][A-Za-z0-9_]*):\s*([^,]+),/);
    if (field?.[1] === undefined || field[2] === undefined) {
      continue;
    }
    if (!field[2].includes("Option<")) {
      fields.add(pendingRename ?? snakeToCamel(field[1]));
    }
    pendingRename = undefined;
  }
  return { fields, source };
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
  return diagnostics;
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
