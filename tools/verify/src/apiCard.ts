import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

export function renderScriptApiCardFromSource(source: string): string {
  const scriptContext = interfaceBody(source, "ScriptContext");
  const entity = interfaceBody(source, "ScriptEntity");
  const transform = interfaceBody(source, "ScriptTransformFacade");
  return `# ThreeNative API Card

Compact local contract for generated-project agents. Prefer this card,
\`tn cookbook <id> --json\`, and \`pnpm run iterate\` before reading repo
package source.

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

- Put durable behavior in \`src/scripts/**/*.ts\`; reference module/export from
  \`content/**/*.json\`.
- Read movement with \`context.input.getAxis("MoveX")\` /
  \`context.input.getAxis("MoveZ")\` or \`context.input.getButton("<name>")\`.
- Move entities through \`entity.transform().position\`,
  \`setPosition([x, y, z])\`, or \`setPose(position, rotation)\`.
- Use \`context.resources.get/set/patch\` for game state and HUD bindings.
- Use \`context.time.fixedDelta\` for deterministic fixed-step movement.
- Supported helper imports: \`Mathf\`, \`Vector2\`, \`Vector3\`, \`Quat\`,
  \`TransformMath\`, \`Bounds2\`, \`Bounds3\`, \`Ease\`, \`RandomEx\`,
  \`ColorEx\`, \`TextEx\`, \`InputEx\`, \`MotionEx\`, \`TimerEx\`,
  \`ArrayEx\`, and \`CameraMath\` from \`@threenative/script-stdlib\`.
  Legacy aliases \`NumberEx\`, \`Vec2\`, and \`Vec3\` remain supported for one
  compatibility cycle.
- Do not import DOM, Node, filesystem, timer, network, Three.js, or Bevy APIs
  from portable scripts.

## Structured Source Shapes

- Scenes: \`content/scenes/*.scene.json\` own entities, transforms, components,
  cameras, resources, UI bindings, and script references.
- Input: \`content/input/*.input.json\` uses actions with
  \`keyboard.KeyW\`-style bindings and axes named \`MoveX\` / \`MoveZ\`.
- Systems: \`content/systems/*.systems.json\` declares every script module,
  export, component read/write, and resource read/write.
- UI: \`content/ui/*.ui.json\` binds HUD text to resource paths such as
  \`GameState.score\`.
- Assets/materials/meshes stay in \`content/assets\`, \`content/materials\`,
  and \`content/meshes\`; preserve stable IDs and schema fields.

## Default Loop

\`\`\`bash
pnpm run iterate
tn playtest report --latest --scenario <name> --json
tn cookbook player-move-wasd --json
tn cookbook follow-camera --json
tn cookbook hud-score-binding --json
tn cookbook top-down-collector-recipe --json
tn cookbook lane-runner-spawn --json
\`\`\`
`;
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
  const body = interfaceBody(source, "ScriptContext");
  return memberNames(body);
}

function compactInterface(name: string, body: string): string {
  return `interface ${name} {\n${body.trim().split("\n").map((line) => `  ${line.trim()}`).join("\n")}\n}`;
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
