import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCompactAuthoringProfile, type ICompactAuthoringProfile } from "@threenative/compiler";

export interface ApiCardValidationResult {
  card: string;
  missingMembers: string[];
  ok: boolean;
  sourceMembers: string[];
  tooLarge: boolean;
}

export const API_CARD_BUDGET_BYTES = 6 * 1024;

export async function renderScriptApiCard(options: { root?: string } = {}): Promise<string> {
  const root = resolve(options.root ?? process.cwd());
  const sourcePath = resolve(root, "packages/script-stdlib/src/script-context.ts");
  return renderScriptApiCardFromSource(await readFile(sourcePath, "utf8"));
}

export function renderScriptApiCardFromSource(
  source: string,
  profile: ICompactAuthoringProfile = createCompactAuthoringProfile(),
): string {
  const scriptContext = scriptContextBody(source);
  const entity = interfaceBody(source, "ScriptEntity");
  const transform = interfaceBody(source, "ScriptTransformFacade");
  const capabilityLines = [
    `- Services: ${compactServices(profile.capabilities.services)}.`,
    `- Entity lifecycle: ${profile.capabilities.runtimeEntities.map((command) => `\`context.commands.${command}\``).join(", ")}.`,
    `- Component commands: ${profile.capabilities.components.commands.map((command) => `\`${command}\``).join(", ")}; entity access: ${profile.capabilities.components.entity.map((command) => `\`${command}\``).join(", ")}.`,
    `- Source edits: prefer ${profile.sourceEditing.preferred}; direct durable source is ${profile.sourceEditing.directDurableSource}; follow with ${profile.sourceEditing.requiredFollowup}.`,
    "- Refresh project types with `tn types generate --project . --json`; prefer `defineBehavior(metadata, fn)` for referenced systems.",
    "- Portable helpers include `Mathf`, `Vector2`, `Vector3`, `Quat`, `MaterialEx`, and `CameraMath`. Legacy aliases `NumberEx`, `Vec2`, and `Vec3` remain supported.",
    ...profile.rules.map((rule) => `- ${rule.instruction}`),
    ...profile.explicitAbsences.map((absence) => `- Absent: ${absence.instruction}`),
  ].join("\n");
  return `# ThreeNative API Card

Contract for agents. Prefer this card,
\`tn cookbook <id> --json\`, and \`pnpm run iterate\` before reading repo
package source. \`tn authoring inspect --project . --json\` returns the canonical
compiler-derived capability, lifecycle, direct-edit, and absence profile.

## ScriptContext

\`\`\`ts
${compactInterface("ScriptContext", scriptContext)}
\`\`\`

## Entity And Transform

\`\`\`ts
${compactInterface("ScriptEntity", entity)}

${compactInterface("ScriptTransformFacade", transform)}
\`\`\`

## Script Authoring Rules

${capabilityLines}

## Structured Source Shapes

- Scenes: \`content/scenes/*.scene.json\` own entities, components, cameras,
  resources, UI bindings, and script references.
- Input: \`content/input/*.input.json\` uses \`keyboard.KeyW\`-style bindings;
  see \`docs/contracts/input-binding-syntax.md\` for the grammar.
- Systems: \`content/systems/*.systems.json\` attaches script module/export
  entries. New access metadata should live in \`defineBehavior\`.
- UI: \`content/ui/*.ui.json\` binds HUD text to resource paths such as
  \`GameState.score\`.

## Actor Shortcuts

\`\`\`bash
tn actor list --project . --json
tn actor add character --id hero --scene <scene> --project . --json
tn actor add vehicle --id player.vehicle --scene <scene> --project . --json
\`\`\`

## Default Loop

\`\`\`bash
pnpm run iterate
tn playtest report --latest --scenario <name> --json
tn cookbook player-move-wasd --json
tn cookbook follow-camera --json
\`\`\`
`;
}

function compactServices(services: readonly string[]): string {
  const groups = new Map<string, string[]>();
  for (const service of services) {
    const separator = service.lastIndexOf(".");
    const owner = separator === -1 ? service : service.slice(0, separator);
    const operation = separator === -1 ? "" : service.slice(separator + 1);
    const operations = groups.get(owner) ?? [];
    operations.push(operation);
    groups.set(owner, operations);
  }
  return [...groups.entries()]
    .map(([owner, operations]) => operations[0] === "" ? `\`${owner}\`` : `\`${owner}(${operations.join("/")})\``)
    .join(", ");
}

export function validateApiCard(options: { card: string; source: string }): ApiCardValidationResult {
  const sourceMembers = scriptContextMembers(options.source);
  const missingMembers = sourceMembers.filter((member) => !options.card.includes(member));
  const tooLarge = Buffer.byteLength(options.card, "utf8") > API_CARD_BUDGET_BYTES;
  return {
    card: options.card,
    missingMembers,
    ok: missingMembers.length === 0 && !tooLarge,
    sourceMembers,
    tooLarge,
  };
}

export function scriptContextMembers(source: string): string[] {
  const body = scriptContextBody(source);
  return memberNames(body);
}

function scriptContextBody(source: string): string {
  const marker = "interface ScriptContext";
  const markerIndex = source.indexOf(marker);
  const open = source.indexOf("{", markerIndex);
  if (markerIndex === -1 || open === -1) {
    return interfaceBody(source, "ScriptContext");
  }
  const declaration = source.slice(markerIndex + marker.length, open);
  const extendsIndex = declaration.indexOf("extends");
  const inherited = extendsIndex === -1
    ? []
    : declaration.slice(extendsIndex + "extends".length).split(",").map((name) => name.trim()).filter(Boolean);
  const compatibilityFacades = ["ScriptInputFacade", "ScriptResourcesFacade", "ScriptTimeFacade"];
  return [
    ...inherited.map((name) => interfaceBody(source, name)),
    ...compatibilityFacades.map((name) => interfaceBody(source, name)),
    interfaceBody(source, "ScriptContext"),
  ].filter(Boolean).join("\n");
}

function compactInterface(name: string, body: string): string {
  return `interface ${name} {\n${body.trim().split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((line) => `  ${line}`).join("\n")}\n}`;
}

function interfaceBody(source: string, name: string): string {
  const marker = `interface ${name}`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Missing ${name} in script context source.`);
  }
  const open = source.indexOf("{", markerIndex);
  if (open === -1) {
    throw new Error(`Missing ${name} interface body.`);
  }
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open + 1, index).trim();
      }
    }
  }
  throw new Error(`Unclosed ${name} interface body.`);
}

function memberNames(body: string): string[] {
  const names: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("}")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:<.*>)?\??(?::|\()/);
    if (match?.[1] !== undefined) {
      names.push(match[1]);
    }
  }
  return names;
}
