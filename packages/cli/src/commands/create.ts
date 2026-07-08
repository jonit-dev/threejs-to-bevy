import { access, chmod, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileTypedGameSpecFile } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { formatGameArchetypeUsage, getGameArchetype, type IGameArchetypeDescriptor } from "../archetypes/registry.js";
import {
  formatTemplateUsage,
  resolveTemplate,
  resolveTemplateSourcePath,
  templatesRootFromModule,
} from "../templates/registry.js";

interface ICreateOptions {
  commandName?: "create" | "init";
  cwd?: string;
}

const moduleUrl = import.meta.url;
const { packaged: packagedTemplatesRoot, source: sourceTemplatesRoot } = templatesRootFromModule(moduleUrl);
const repoRoot = resolve(sourceTemplatesRoot, "..");
const cliBin = resolve(repoRoot, "packages/cli/dist/index.js");
const publishedPackageVersion = "0.1.0";
const generatedTemplateEntryNames = new Set(["dist", "node_modules", "artifacts"]);
const agentGamePlanPath = "AGENT_GAME_PLAN.md";
const sharedAgentGamePlanPath = `_shared/${agentGamePlanPath}`;

export async function createProject(argv: readonly string[], options: ICreateOptions = {}): Promise<ICommandResult> {
  const commandName = options.commandName ?? "create";
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const templateFlagIndex = normalizedArgv.indexOf("--template");
  const requestedTemplate = templateFlagIndex === -1 ? undefined : normalizedArgv[templateFlagIndex + 1];
  const archetypeFlagIndex = normalizedArgv.indexOf("--archetype");
  const requestedArchetype = archetypeFlagIndex === -1 ? undefined : normalizedArgv[archetypeFlagIndex + 1];
  const renderProfileFlagIndex = normalizedArgv.indexOf("--render-profile");
  const renderProfile = renderProfileFlagIndex === -1 ? "cinematic" : normalizedArgv[renderProfileFlagIndex + 1];
  const authoringFlagIndex = normalizedArgv.indexOf("--authoring");
  const authoringMode = authoringFlagIndex === -1 ? "structured-source" : normalizedArgv[authoringFlagIndex + 1];
  const destinationArg = normalizedArgv.find((arg, index) => {
    const previous = normalizedArgv[index - 1];
    return !arg.startsWith("-") && previous !== "--archetype" && previous !== "--authoring" && previous !== "--template" && previous !== "--render-profile";
  });

  if (destinationArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_CREATE_DESTINATION_REQUIRED",
        message: `Usage: tn ${commandName} <name> [${formatTemplateUsage()}] [--archetype ${formatGameArchetypeUsage()}] [--render-profile parity|balanced|cinematic|stylized] [--authoring structured-source|typed-spec] [--json]`,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const resolvedTemplate = resolveTemplate(requestedTemplate);
  const archetype = requestedArchetype === undefined ? undefined : getGameArchetype(requestedArchetype);
  if (requestedArchetype !== undefined && archetype === undefined) {
    return diagnosticResult(
      {
        archetype: requestedArchetype,
        code: "TN_CREATE_ARCHETYPE_UNSUPPORTED",
        message: `Archetype '${requestedArchetype}' is not supported. Canonical options: ${formatGameArchetypeUsage()}.`,
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  if (!resolvedTemplate) {
    return diagnosticResult(
      {
        code: "TN_CREATE_TEMPLATE_UNSUPPORTED",
        message: `Template '${requestedTemplate ?? ""}' is not supported. Canonical options: ${formatTemplateUsage()}.`,
        template: requestedTemplate,
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  if (!isRenderProfile(renderProfile)) {
    return diagnosticResult(
      {
        code: "TN_CREATE_RENDER_PROFILE_UNSUPPORTED",
        message: "Render profile must be one of parity, balanced, cinematic, or stylized.",
        profile: renderProfile,
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  if (!isAuthoringMode(authoringMode)) {
    return diagnosticResult(
      {
        code: "TN_CREATE_AUTHORING_UNSUPPORTED",
        message: "Authoring mode must be one of structured-source or typed-spec.",
        mode: authoringMode,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const { definition } = resolvedTemplate;
  const cwd = options.cwd ?? process.env.INIT_CWD ?? process.cwd();
  const projectPath = isAbsolute(destinationArg) ? destinationArg : resolve(cwd, destinationArg);

  try {
    const entries = await readdir(projectPath);
    if (entries.length > 0) {
      return diagnosticResult(
        {
          code: "TN_CREATE_DESTINATION_NOT_EMPTY",
          message: `Destination '${projectPath}' already exists and is not empty.`,
          path: projectPath,
        },
        { exitCode: 1, json, stderr: true },
      );
    }
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const sourceCheckout = await isSourceCheckout();
  const templatesRoot = sourceCheckout ? sourceTemplatesRoot : packagedTemplatesRoot;
  const templateSourcePath = resolveTemplateSourcePath(templatesRoot, definition);
  const templateOwnedPlanPath = resolve(templateSourcePath, agentGamePlanPath);
  const sharedPlanPath = resolve(templatesRoot, sharedAgentGamePlanPath);

  if (await pathExists(templateOwnedPlanPath)) {
    return diagnosticResult(
      {
        code: "TN_CREATE_AGENT_PLAN_CONFLICT",
        message: `Template '${definition.canonical}' owns ${agentGamePlanPath}; shared planning instructions cannot be scaffolded without an explicit registry override.`,
        path: templateOwnedPlanPath,
        suggestedFix: `Move the template-owned plan to templates/_shared/${agentGamePlanPath} or add a future registry override before scaffolding.`,
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  if (!(await pathExists(sharedPlanPath))) {
    return diagnosticResult(
      {
        code: "TN_CREATE_AGENT_PLAN_MISSING",
        message: `Shared planning instructions are missing at '${sharedPlanPath}'.`,
        path: sharedPlanPath,
        suggestedFix: `Add templates/_shared/${agentGamePlanPath} before creating agent-assisted game projects.`,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  await mkdir(projectPath, { recursive: true });
  await copyTemplateFiles(templateSourcePath, projectPath);
  await copySharedPlanningInstructions(sharedPlanPath, projectPath);
  await rewriteProjectTemplateMetadata(projectPath, definition.canonical);
  await rewriteRuntimeRenderProfile(projectPath, renderProfile);
  if (authoringMode === "typed-spec") {
    await applyTypedSpecAuthoring(projectPath);
  }
  if (archetype !== undefined) {
    await applyArchetypeScaffold(projectPath, archetype);
  }

  if (sourceCheckout) {
    await rewriteLocalWorkspaceDependencies(projectPath);
    await writeLocalCliWrapperPackage(projectPath);
  } else {
    await rewritePublishedDependencies(projectPath);
  }

  const payload = {
    code: "TN_CREATE_OK",
    command: commandName,
    message: `Created ${definition.canonical} project at '${projectPath}'.`,
    nextCommands: ["pnpm install", "pnpm run game:plan", "pnpm run validate", "pnpm run build", "pnpm run iterate", "pnpm run dev:web", "pnpm run verify"],
    path: projectPath,
    planningInstructions: agentGamePlanPath,
    referenceDocs: [
      agentGamePlanPath,
      "docs/workflows/developer-workflow.md",
      "docs/workflows/ai-workflows.md",
      "tn help scaffold",
      "tn help visual-qa",
    ],
    renderProfile,
    template: definition.canonical,
    authoring: authoringMode,
    ...(archetype === undefined ? {} : {
      archetype: archetype.id,
      archetypeProbe: archetype.probe.path,
    }),
  };

  if (json) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  return {
    exitCode: 0,
    stdout: `${payload.message}\nPlanning: open ${agentGamePlanPath} and run pnpm run game:plan before mutating game source.\nNext commands:\n  cd ${projectPath}\n  pnpm install\n  pnpm run game:plan\n  pnpm run validate\n  pnpm run build\n  pnpm run iterate\n  pnpm run dev:web\n  pnpm run verify\nDocs: ${agentGamePlanPath}, tn help scaffold, tn help visual-qa\n`,
  };
}

function isRenderProfile(value: string | undefined): value is "parity" | "balanced" | "cinematic" | "stylized" {
  return value === "parity" || value === "balanced" || value === "cinematic" || value === "stylized";
}

function isAuthoringMode(value: string | undefined): value is "structured-source" | "typed-spec" {
  return value === "structured-source" || value === "typed-spec";
}

async function applyTypedSpecAuthoring(projectPath: string): Promise<void> {
  await writeTypedSpecStarter(projectPath);
  await compileTypedGameSpecFile({ projectPath });
  await rewriteTypedSpecConfig(projectPath);
  await rewriteTypedSpecPackageScripts(projectPath);
}

async function writeTypedSpecStarter(projectPath: string): Promise<void> {
  const specPath = resolve(projectPath, "src/game.spec.ts");
  await mkdir(resolve(specPath, ".."), { recursive: true });
  await writeFile(specPath, `import { defineTypedGameSpec } from "@threenative/sdk";

export default defineTypedGameSpec({
  input: {
    axes: [
      { id: "move-x", negative: ["keyboard.KeyA", "keyboard.ArrowLeft"], positive: ["keyboard.KeyD", "keyboard.ArrowRight"] },
      { id: "move-z", negative: ["keyboard.KeyS", "keyboard.ArrowDown"], positive: ["keyboard.KeyW", "keyboard.ArrowUp"] },
    ],
    id: "arena",
  },
  materials: [
    { color: "#44aa88", id: "player-material", roughness: 0.7 },
    { color: "#f2c14e", id: "goal-material", roughness: 0.55 },
  ],
  scenes: [{
    entities: [
      {
        components: {
          CharacterController: { blocking: false, grounding: "none", moveXAxis: "move-x", moveZAxis: "move-z", speed: 4 },
          Collider: { height: 1, kind: "capsule", radius: 0.25 },
          MeshRenderer: { material: "player-material" },
          RigidBody: { kind: "kinematic" },
        },
        id: "player",
        transform: { position: [0, 0.5, 0] },
      },
      {
        components: {
          MeshRenderer: { material: "goal-material" },
        },
        id: "goal",
        transform: { position: [3, 0.25, 0], scale: [0.7, 0.2, 0.7] },
      },
      {
        components: {
          camera: { mode: "perspective", fovY: 50, near: 0.05, far: 100 },
        },
        id: "camera.main",
        transform: { position: [0, 5.5, 6.5], rotation: [-0.7, 0, 0] },
      },
    ],
    id: "arena",
    initial: true,
    resources: [{ id: "score", value: 0 }],
    systems: [{ id: "score-system", resourceReads: ["score"], writes: ["Transform"] }],
    ui: {
      bindings: [{ node: "score-label", resource: "score" }],
      nodes: [{ id: "score-label", text: "Score", type: "text" }],
    },
  }],
});
`, "utf8");
}

async function rewriteTypedSpecConfig(projectPath: string): Promise<void> {
  const configPath = resolve(projectPath, "threenative.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  const production = isRecord(config.production) ? config.production : {};
  const agent = isRecord(production.agent) ? production.agent : {};
  const sourceShape = isRecord(agent.sourceShape) ? agent.sourceShape : {};
  const proofCommands = arrayOfStrings(production.proofCommands);
  const agentProofCommands = arrayOfStrings(agent.proofCommands);
  config.entry = "content/scenes/arena.scene.json";
  config.outDir = "dist/typed-spec-starter.bundle";
  config.production = {
    ...production,
    authoringMode: "typed-spec",
    agent: {
      ...agent,
      authoringMode: "typed-spec",
      sourceShape: {
        ...sourceShape,
        typedSpec: "src/game.spec.ts",
      },
      proofCommands: uniqueStrings(["tn authoring compile-typed-spec --project . --json", ...agentProofCommands]),
    },
    proofCommands: uniqueStrings(["tn authoring compile-typed-spec --project . --json", ...proofCommands]),
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function rewriteTypedSpecPackageScripts(projectPath: string): Promise<void> {
  const packageJsonPath = resolve(projectPath, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
  packageJson.scripts = {
    ...scripts,
    "authoring:compile": "pnpm tn -- authoring compile-typed-spec --json",
    build: "pnpm tn -- authoring compile-typed-spec --json && pnpm tn -- build",
    validate: "pnpm tn -- authoring compile-typed-spec --json && pnpm tn -- validate",
    "validate:authoring": "pnpm tn -- authoring compile-typed-spec --json && pnpm tn -- authoring validate --json",
  };
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function rewriteRuntimeRenderProfile(projectPath: string, renderProfile: "parity" | "balanced" | "cinematic" | "stylized"): Promise<void> {
  const runtimePath = resolve(projectPath, "content/runtime/default.runtime.json");
  try {
    const runtime = JSON.parse(await readFile(runtimePath, "utf8")) as Record<string, unknown>;
    const renderer = typeof runtime.renderer === "object" && runtime.renderer !== null && !Array.isArray(runtime.renderer)
      ? runtime.renderer as Record<string, unknown>
      : {};
    const existingRenderLook = typeof renderer.renderLook === "object" && renderer.renderLook !== null && !Array.isArray(renderer.renderLook)
      ? renderer.renderLook as Record<string, unknown>
      : {};
    runtime.renderer = {
      ...renderer,
      renderLook: renderProfile === "balanced"
        ? { ...existingRenderLook, version: 1, profile: renderProfile }
        : { version: 1, profile: renderProfile },
    };
    await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  } catch {
    // Templates without runtime source keep their existing shape.
  }
}

async function applyArchetypeScaffold(projectPath: string, archetype: IGameArchetypeDescriptor): Promise<void> {
  await writeArchetypeContent(projectPath, archetype);
  await writeArchetypeProbe(projectPath, archetype);
  await writeArchetypeScript(projectPath, archetype);
  await rewriteArchetypeConfig(projectPath, archetype);
  await rewriteArchetypePackageScripts(projectPath, archetype);
}

async function writeArchetypeContent(projectPath: string, archetype: IGameArchetypeDescriptor): Promise<void> {
  const relativePath = `content/archetypes/${archetype.id}.archetype.json`;
  const absolutePath = resolve(projectPath, relativePath);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(
      {
        controls: archetype.controls,
        id: archetype.id,
        kind: "game-archetype",
        label: archetype.label,
        lookProfile: archetype.lookProfile,
        probe: archetype.probe,
        schema: "threenative.archetype",
        script: archetype.script,
        summary: archetype.summary,
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function writeArchetypeProbe(projectPath: string, archetype: IGameArchetypeDescriptor): Promise<void> {
  const absolutePath = resolve(projectPath, archetype.probe.path);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(
      {
        artifacts: {
          console: true,
          network: true,
          runtimeTrace: true,
          screenshots: "before-after",
        },
        assert: {
          diagnostics: {
            noConsoleErrors: true,
            noNetworkErrors: true,
            noRuntimeDiagnostics: true,
            runtimeReady: true,
          },
          movement: {
            axis: archetype.probe.axis,
            entity: "player",
            minDistance: 0.05,
            minVelocity: 0.001,
          },
        },
        name: archetype.probe.name,
        schemaVersion: 1,
        steps: [
          {
            holdFrames: 30,
            label: `prove-${archetype.id}-input`,
            press: archetype.probe.press,
            release: true,
          },
        ],
        subject: "player",
        target: "web",
        viewport: {
          height: 720,
          width: 1280,
        },
        warmupFrames: 5,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function writeArchetypeScript(projectPath: string, archetype: IGameArchetypeDescriptor): Promise<void> {
  const absolutePath = resolve(projectPath, archetype.script.module);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  const source = `import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function ${archetype.script.exportName}(context: ScriptContext): void {
  const player = context.entity("player") ?? context.query({ limit: 1 })[0];
  if (player === undefined) {
    return;
  }
  const transform = player.transform();
  const position = transform.position;
  const direction = context.input.getAxis("MoveX");
  const delta = context.time.fixedDelta;
  transform.position = Vector3.add(position, [direction * delta * 2.4, 0, 0]);
}
`;
  await writeFile(absolutePath, source, "utf8");
}

async function rewriteArchetypeConfig(projectPath: string, archetype: IGameArchetypeDescriptor): Promise<void> {
  const configPath = resolve(projectPath, "threenative.config.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    const production = isRecord(config.production) ? config.production : {};
    const agent = isRecord(production.agent) ? production.agent : {};
    const sourceShape = isRecord(agent.sourceShape) ? agent.sourceShape : {};
    const proofCommands = arrayOfStrings(production.proofCommands);
    const agentProofCommands = arrayOfStrings(agent.proofCommands);
    const archetypeProof = `tn playtest --project . --scenario ${archetype.probe.path} --stable-artifacts --json`;

    config.production = {
      ...production,
      archetype: archetype.id,
      archetypeSource: `content/archetypes/${archetype.id}.archetype.json`,
      controls: archetype.controls,
      lookProfile: archetype.lookProfile,
      proofCommands: uniqueStrings([...proofCommands, archetypeProof]),
      agent: {
        ...agent,
        archetype: {
          controls: archetype.controls,
          id: archetype.id,
          lookProfile: archetype.lookProfile,
          probe: archetype.probe.path,
          script: archetype.script,
        },
        proofCommands: uniqueStrings([...agentProofCommands, archetypeProof]),
        sourceShape: {
          ...sourceShape,
          archetypes: [`content/archetypes/${archetype.id}.archetype.json`],
          scripts: uniqueStrings([...arrayOfStrings(sourceShape.scripts), archetype.script.module]),
        },
      },
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch {
    // Templates without project config cannot receive archetype metadata.
  }
}

async function rewriteArchetypePackageScripts(projectPath: string, archetype: IGameArchetypeDescriptor): Promise<void> {
  const packageJsonPath = resolve(projectPath, "package.json");
  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
    const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
    packageJson.scripts = {
      ...scripts,
      "playtest:archetype": `tn playtest --scenario ${archetype.probe.path} --stable-artifacts --json`,
    };
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  } catch {
    // Templates without package scripts cannot receive the convenience command.
  }
}

async function copyTemplateFiles(templateSourcePath: string, projectPath: string): Promise<void> {
  await cp(templateSourcePath, projectPath, {
    recursive: true,
    force: false,
    filter: (sourcePath) => shouldCopyTemplatePath(templateSourcePath, sourcePath),
  });
}

async function copySharedPlanningInstructions(sharedPlanPath: string, projectPath: string): Promise<void> {
  await cp(sharedPlanPath, resolve(projectPath, agentGamePlanPath), {
    force: false,
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function shouldCopyTemplatePath(templateSourcePath: string, sourcePath: string): boolean {
  const relativePath = relative(templateSourcePath, sourcePath);
  if (relativePath === "") {
    return true;
  }

  return !relativePath.split(sep).some((part) => generatedTemplateEntryNames.has(part));
}

export async function initProject(argv: readonly string[], options: Omit<ICreateOptions, "commandName"> = {}): Promise<ICommandResult> {
  return createProject(argv, { ...options, commandName: "init" });
}

async function rewriteProjectTemplateMetadata(projectPath: string, canonicalTemplate: string): Promise<void> {
  const configPath = resolve(projectPath, "threenative.config.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8")) as { template?: string };
    config.template = canonicalTemplate;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch {
    // Some templates may not ship a config yet.
  }
}

async function rewriteLocalWorkspaceDependencies(projectPath: string): Promise<void> {
  const packageJsonPath = resolve(projectPath, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  packageJson.dependencies = rewriteDependency(packageJson.dependencies ?? {}, "@threenative/sdk", "packages/sdk");
  packageJson.dependencies = rewriteDependency(packageJson.dependencies, "@threenative/script-stdlib", "packages/script-stdlib", {
    onlyIfPresent: true,
  });
  packageJson.dependencies = rewriteDependency(packageJson.dependencies, "@threenative/r3f", "packages/r3f", {
    onlyIfPresent: true,
  });
  packageJson.dependencies = rewriteDependency(packageJson.dependencies, "@threenative/ui", "packages/ui", {
    onlyIfPresent: true,
  });
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@threenative/cli": "file:.threenative/cli",
  };

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function rewritePublishedDependencies(projectPath: string): Promise<void> {
  const packageJsonPath = resolve(projectPath, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  packageJson.dependencies = rewritePublishedDependency(packageJson.dependencies ?? {}, "@threenative/sdk");
  packageJson.dependencies = rewritePublishedDependency(packageJson.dependencies, "@threenative/script-stdlib", {
    onlyIfPresent: true,
  });
  packageJson.dependencies = rewritePublishedDependency(packageJson.dependencies, "@threenative/r3f", {
    onlyIfPresent: true,
  });
  packageJson.dependencies = rewritePublishedDependency(packageJson.dependencies, "@threenative/ui", {
    onlyIfPresent: true,
  });
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@threenative/cli": `^${publishedPackageVersion}`,
  };

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function rewriteDependency(
  dependencies: Record<string, string>,
  name: string,
  packagePath: string,
  options: { onlyIfPresent?: boolean } = {},
): Record<string, string> {
  if (options.onlyIfPresent === true && dependencies[name] === undefined) {
    return dependencies;
  }

  return {
    ...dependencies,
    [name]: `file:${resolve(repoRoot, packagePath)}`,
  };
}

function rewritePublishedDependency(
  dependencies: Record<string, string>,
  name: string,
  options: { onlyIfPresent?: boolean } = {},
): Record<string, string> {
  if (options.onlyIfPresent === true && dependencies[name] === undefined) {
    return dependencies;
  }

  return {
    ...dependencies,
    [name]: `^${publishedPackageVersion}`,
  };
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function writeLocalCliWrapperPackage(projectPath: string): Promise<void> {
  const wrapperDir = resolve(projectPath, ".threenative/cli");
  const wrapperPath = resolve(wrapperDir, "index.js");
  const cliModuleUrl = pathToFileURL(cliBin).href;

  await mkdir(wrapperDir, { recursive: true });
  await writeFile(
    resolve(wrapperDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@threenative/cli",
        version: "0.0.0-local",
        type: "module",
        bin: {
          tn: "./index.js",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(wrapperPath, `#!/usr/bin/env node\nimport { main } from ${JSON.stringify(cliModuleUrl)};\n\nvoid main(process.argv.slice(2));\n`);
  await chmod(wrapperPath, 0o755);
}

async function isSourceCheckout(): Promise<boolean> {
  try {
    await access(resolve(sourceTemplatesRoot, "structured-source-starter", "package.json"));
    await access(resolve(repoRoot, "packages", "cli", "package.json"));
    return true;
  } catch {
    return false;
  }
}

export {
  formatTemplateUsage,
  listCanonicalTemplates,
  resolveTemplate,
  TEMPLATE_REGISTRY,
} from "../templates/registry.js";
