import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { listAuthoringOperationDescriptors } from "../../authoring/dist/index.js";

const outputPath = resolve(import.meta.dirname, "../src/generatedOperations.ts");
const check = process.argv.includes("--check");
const quote = (value) => JSON.stringify(value);
const interfaceName = (name) => `${name.split(/[._-]/u).map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join("")}Args`;

function argumentType(argument) {
  const enumValues = argument.constraints?.enumValues;
  if (enumValues?.length > 0) {
    const union = enumValues.map(quote).join(" | ");
    return argument.type === "string-array" ? `readonly (${union})[]` : union;
  }
  return {
    boolean: "boolean",
    "json-object": "AuthoringJsonObject",
    "json-object-array": "readonly AuthoringJsonObject[]",
    "json-value": "AuthoringJsonValue",
    number: "number",
    "number-array": "readonly number[]",
    string: "string",
    "string-array": "readonly string[]",
    vector3: "AuthoringVector3",
  }[argument.type];
}

function render() {
  const descriptors = listAuthoringOperationDescriptors();
  const lines = [
    "// Generated from @threenative/authoring operation descriptors. Do not edit by hand.",
    "",
    "export type AuthoringJsonValue = boolean | number | string | null | AuthoringJsonValue[] | { [key: string]: AuthoringJsonValue };",
    "export type AuthoringJsonObject = { [key: string]: AuthoringJsonValue };",
    "export type AuthoringVector3 = readonly [number, number, number];",
    "",
  ];
  for (const descriptor of descriptors) {
    lines.push(`export interface ${interfaceName(descriptor.name)} {`);
    for (const argument of descriptor.arguments) {
      lines.push(`  ${quote(argument.name)}${argument.required ? "" : "?"}: ${argumentType(argument)};`);
    }
    lines.push("}", "");
  }
  lines.push("export interface AuthoringOperationArgsMap {");
  for (const descriptor of descriptors) lines.push(`  ${quote(descriptor.name)}: ${interfaceName(descriptor.name)};`);
  lines.push(
    "}",
    "",
    "export type GeneratedAuthoringOperationName = keyof AuthoringOperationArgsMap;",
    "export type AuthoringOperationArgs<TName extends GeneratedAuthoringOperationName> = AuthoringOperationArgsMap[TName];",
    "export type AuthoringOperationCallArgs<TName extends GeneratedAuthoringOperationName> = {} extends AuthoringOperationArgs<TName>",
    "  ? [args?: AuthoringOperationArgs<TName>]",
    "  : [args: AuthoringOperationArgs<TName>];",
    "",
  );
  return `${lines.join("\n")}\n`;
}

const generated = render();
if (check) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== generated) {
    console.error("generatedOperations.ts is stale; run pnpm generate:operations");
    process.exit(1);
  }
} else {
  await writeFile(outputPath, generated, "utf8");
}
