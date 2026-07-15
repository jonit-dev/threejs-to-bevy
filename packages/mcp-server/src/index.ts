import { readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import {
  applyAuthoringBatch,
  AUTHORING_BATCH_SCHEMA,
  AUTHORING_BATCH_VERSION,
  AUTHORING_OPERATION_NAMES,
  buildAuthoringOperationCliArgv,
  getAuthoringOperationDescriptor,
  planAuthoringBatch,
  type AuthoringOperationName,
  type IAuthoringBatchDocument,
  type IAuthoringOperationArgumentDescriptor,
} from "@threenative/authoring";
import { CLI_COMMAND_REGISTRY, dispatch, type CommandMcpToolName, type ICommandMcpAdapterDefinition } from "@threenative/cli";

export type AuthoringMcpToolName =
  | AuthoringOperationName
  | "authoring.batch.apply"
  | "authoring.batch.plan"
  | "bundle.import"
  | CommandMcpToolName
  | "project.build"
  | "project.screenshot"
  | "project.verify"
  | "scene.inspect"
  | "scene.validate";

export interface IAuthoringMcpToolCall {
  arguments?: Record<string, unknown>;
  name: AuthoringMcpToolName;
}

export interface IAuthoringMcpOptions {
  allowedProjectRoots?: readonly string[];
  execute?: (argv: readonly string[]) => Promise<ICommandResult>;
  projectRoot: string;
}

export interface IAuthoringMcpResult {
  cli: {
    argv: string[];
    exitCode: number;
  };
  content: unknown;
  isError: boolean;
}

interface ICommandResult {
  exitCode: number;
  stderr?: string;
  stdout: string;
}

const registryBackedMcpTools: Array<{ description: string; name: AuthoringOperationName }> = AUTHORING_OPERATION_NAMES.map((name) => {
  const descriptor = getAuthoringOperationDescriptor(name);
  return {
    description: descriptor?.description ?? `Dispatch ${name} through the shared authoring operation registry.`,
    name,
  };
});

export const AUTHORING_BATCH_MCP_INPUT_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    actor: { type: "string" },
    id: { minLength: 1, type: "string" },
    intent: { type: "string" },
    operations: {
      items: {
        oneOf: AUTHORING_OPERATION_NAMES.map((name) => batchOperationSchema(name)),
      },
      minItems: 1,
      type: "array",
    },
    preconditions: {
      additionalProperties: false,
      properties: { planHash: { minLength: 1, type: "string" } },
      type: "object",
    },
    schema: { const: AUTHORING_BATCH_SCHEMA, type: "string" },
    version: { const: AUTHORING_BATCH_VERSION, type: "string" },
  },
  required: ["schema", "version", "id", "operations"],
  type: "object",
};

const commandRegistryBackedMcpTools: Array<{ description: string; inputSchema?: Record<string, unknown>; name: AuthoringMcpToolName }> = Object.values(CLI_COMMAND_REGISTRY)
  .flatMap((command) => command.adapters?.mcp === undefined ? [] : (Array.isArray(command.adapters.mcp) ? command.adapters.mcp : [command.adapters.mcp]).map((adapter) => ({
    description: adapter.description,
    ...(adapter.inputSchema === undefined ? {} : { inputSchema: adapter.inputSchema }),
    name: adapter.name,
  })));

export const AUTHORING_MCP_TOOLS: Array<{ description: string; inputSchema?: Record<string, unknown>; name: AuthoringMcpToolName }> = [
  { description: "Inspect a source scene document through tn scene inspect --json.", name: "scene.inspect" },
  { description: "Validate source scene documents through tn scene validate --json.", name: "scene.validate" },
  { description: "Plan a validated atomic authoring batch without publishing source changes.", inputSchema: AUTHORING_BATCH_MCP_INPUT_SCHEMA, name: "authoring.batch.plan" },
  { description: "Apply a validated atomic authoring batch through the shared authoring committer.", inputSchema: AUTHORING_BATCH_MCP_INPUT_SCHEMA, name: "authoring.batch.apply" },
  ...commandRegistryBackedMcpTools,
  ...registryBackedMcpTools,
  { description: "Import recoverable bundle catalogs through tn bundle import --json.", name: "bundle.import" },
  { description: "Build the project through tn build --json.", name: "project.build" },
  { description: "Capture a screenshot through tn screenshot --json.", name: "project.screenshot" },
  { description: "Run visual verification through tn verify --json.", name: "project.verify" },
];

export async function callAuthoringMcpTool(call: IAuthoringMcpToolCall, options: IAuthoringMcpOptions): Promise<IAuthoringMcpResult> {
  const args = call.arguments ?? {};
  if (isAuthoringBatchTool(call.name)) {
    try {
      validateJsonSchemaValue(args, AUTHORING_BATCH_MCP_INPUT_SCHEMA, call.name);
    } catch (error) {
      return mcpDiagnostic({
        code: "TN_MCP_ARGUMENT_INVALID",
        message: error instanceof Error ? error.message : String(error),
        path: call.name,
      });
    }
  }
  const earlyArgumentDiagnostic = validateEarlyCommandArguments(call.name, args);
  if (earlyArgumentDiagnostic !== undefined) {
    return mcpDiagnostic(earlyArgumentDiagnostic);
  }
  const projectRoot = resolve(options.projectRoot);
  const guard = await validateProjectRoot(projectRoot, options.allowedProjectRoots ?? [process.cwd()]);
  if (guard !== undefined) {
    return mcpDiagnostic(guard);
  }
  if (isAuthoringBatchTool(call.name)) {
    const mode = call.name === "authoring.batch.plan" ? "plan" : "apply";
    const batch = args as unknown as IAuthoringBatchDocument;
    const result = mode === "plan"
      ? await planAuthoringBatch({ batch, projectPath: projectRoot })
      : await applyAuthoringBatch({ batch, projectPath: projectRoot });
    return {
      cli: { argv: ["authoring", "batch", mode, "--project", projectRoot, "--json"], exitCode: result.ok ? 0 : 1 },
      content: result,
      isError: !result.ok,
    };
  }
  let argv: string[];
  try {
    argv = toolToCliArgv(call.name, args, projectRoot);
  } catch (error) {
    return mcpDiagnostic({
      code: "TN_MCP_ARGUMENT_INVALID",
      message: error instanceof Error ? error.message : String(error),
      path: call.name,
    });
  }
  const invalidPath = await validateToolPaths(call.name, args, projectRoot);
  if (invalidPath !== undefined) {
    return mcpDiagnostic(invalidPath, argv);
  }
  const result = await (options.execute ?? dispatch)(argv);
  return commandResultToMcp(result, argv, call.name, projectRoot);
}

function toolToCliArgv(name: AuthoringMcpToolName, args: Record<string, unknown>, projectRoot: string): string[] {
  const project = ["--project", projectRoot];
  const commandAdapter = commandMcpAdapter(name);
  if (commandAdapter?.argv !== undefined) {
    validateCommandMcpArguments(commandAdapter, args);
    const argv = [...commandAdapter.argv.prefix];
    for (const argument of commandAdapter.argv.arguments) {
      const value = args[argument.name];
      if (value === undefined) continue;
      if (argument.boolean === true) {
        if (typeof value !== "boolean") throw new Error(`MCP argument '${argument.name}' must be a boolean.`);
        if (value && argument.flag !== undefined) argv.push(argument.flag);
        continue;
      }
      const raw = argument.encoding === "json" && typeof value !== "string" ? JSON.stringify(value) : commandAdapterArgument(value, argument.name);
      const encoded = argument.resolveProjectPath === true ? resolve(projectRoot, raw) : raw;
      if (argument.positional === true) argv.push(encoded);
      else if (argument.flag !== undefined) argv.push(argument.flag, encoded);
    }
    argv.push(...(commandAdapter.argv.fixed ?? []));
    if (commandAdapter.argv.projectOutput !== undefined) argv.push(commandAdapter.argv.projectOutput.flag, resolve(projectRoot, commandAdapter.argv.projectOutput.path));
    if (commandAdapter.argv.projectScoped === true) argv.push(...project);
    argv.push("--json");
    return argv;
  }
  if (name === "cookbook_lookup") {
    const id = optionalStringArg(args, "id");
    const query = optionalStringArg(args, "query");
    if (id !== undefined && query !== undefined) {
      throw new Error("MCP tool 'cookbook_lookup' requires exactly one of 'id' or 'query'.");
    }
    if (id !== undefined) {
      return ["cookbook", "show", id, "--json"];
    }
    if (query !== undefined) {
      return ["cookbook", "search", query, "--json"];
    }
    throw new Error("MCP tool 'cookbook_lookup' requires exactly one of 'id' or 'query'.");
  }
  if (name === "scene.inspect") {
    return ["scene", "inspect", stringArg(args, "sceneId"), ...project, "--json"];
  }
  if (name === "scene.validate") {
    const sceneId = optionalStringArg(args, "sceneId");
    return ["scene", "validate", ...(sceneId === undefined ? [] : [sceneId]), ...project, "--json"];
  }
  const descriptor = getAuthoringOperationDescriptor(name);
  if (descriptor?.adapters?.cli !== undefined) {
    return buildAuthoringOperationCliArgv(name, args, { projectPath: projectRoot });
  }
  if (name === "scene.add_entity") {
    const prefabId = optionalStringArg(args, "prefabId");
    return ["scene", "add-entity", stringArg(args, "sceneId"), stringArg(args, "entityId"), ...(prefabId === undefined ? [] : ["--prefab", prefabId]), ...project, "--json"];
  }
  if (name === "scene.attach_script") {
    return ["scene", "attach-script", stringArg(args, "sceneId"), stringArg(args, "systemId"), "--module", stringArg(args, "modulePath"), "--export", stringArg(args, "exportName"), ...project, "--json"];
  }
  if (name === "scene.bind_ui") {
    return ["scene", "bind-ui", stringArg(args, "sceneId"), stringArg(args, "uiNodeId"), "--resource", stringArg(args, "resourcePath"), ...project, "--json"];
  }
  if (name === "ui.bind") {
    return ["ui", "bind", stringArg(args, "uiDocId"), stringArg(args, "nodeId"), "--resource", stringArg(args, "resourcePath"), ...project, "--json"];
  }
  if (name === "bundle.import") {
    return ["bundle", "import", stringArg(args, "bundleDir"), ...project, "--mode", "source", ...(args.dryRun === true ? ["--dry-run"] : []), "--json"];
  }
  if (name === "system.attach_script") {
    return ["system", "attach-script", stringArg(args, "systemId"), "--module", stringArg(args, "modulePath"), "--export", stringArg(args, "exportName"), ...project, "--json"];
  }
  if (AUTHORING_OPERATION_NAMES.includes(name as AuthoringOperationName)) {
    throw new Error(`Authoring operation '${name}' is missing CLI adapter metadata.`);
  }
  if (name === "project.build") {
    return ["build", ...project, "--json"];
  }
  if (name === "project.verify") {
    const frames = optionalNumberArg(args, "frames");
    const url = optionalStringArg(args, "url");
    return [
      "verify",
      ...project,
      ...(url === undefined ? [] : ["--url", url]),
      ...(frames === undefined ? [] : ["--frames", frames.toString()]),
      ...(args.expectMotion === true ? ["--expect-motion"] : []),
      "--json",
    ];
  }
  const out = stringArg(args, "out");
  const url = stringArg(args, "url");
  return ["screenshot", "--url", url, "--out", out, "--json"];
}

async function commandResultToMcp(result: ICommandResult, argv: string[], toolName: AuthoringMcpToolName, projectRoot: string): Promise<IAuthoringMcpResult> {
  const raw = result.stdout.length > 0 ? result.stdout : result.stderr ?? "";
  let content: unknown = raw;
  try {
    content = JSON.parse(raw);
  } catch {
    // Human output remains useful when a CLI path has not yet gained JSON.
  }
  if (toolName === "asset.sketchfab_preview" && isRecord(content) && isRecord(content.image) && typeof content.image.dataBase64 === "string" && typeof content.image.mimeType === "string") {
    const image = content.image;
    const metadata = { ...content, image: { mimeType: image.mimeType, sha256: image.sha256 } };
    content = [{ data: image.dataBase64, mimeType: image.mimeType, type: "image" }, { text: JSON.stringify(metadata), type: "text" }];
  }
  if (toolName === "asset.model_test" && isRecord(content) && isRecord(content.screenshot) && typeof content.screenshot.outPath === "string") {
    const outPath = await realpath(resolve(content.screenshot.outPath)).catch(() => undefined);
    const realRoot = await realpath(projectRoot);
    if (outPath === undefined || !isContained(realRoot, outPath)) throw new Error("TN_MCP_PATH_REJECTED: model-test screenshot resolves outside the project root.");
    const bytes = await readFile(outPath);
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.byteLength > 16 * 1024 * 1024 || bytes.byteLength < pngSignature.length || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) throw new Error("TN_MCP_IMAGE_INVALID: model-test screenshot is not a bounded PNG.");
    content = [{ data: bytes.toString("base64"), mimeType: "image/png", type: "image" }, { text: JSON.stringify(content), type: "text" }];
  }
  return {
    cli: { argv, exitCode: result.exitCode },
    content,
    isError: result.exitCode !== 0,
  };
}

async function validateProjectRoot(projectRoot: string, allowedProjectRoots: readonly string[]): Promise<{ code: string; message: string; path: string } | undefined> {
  const projectRealPath = await realpath(projectRoot).catch(() => undefined);
  const allowed = (await Promise.all(allowedProjectRoots.map((root) => realpath(resolve(root)).catch(() => undefined)))).filter((root): root is string => root !== undefined);
  if (projectRealPath === undefined || !allowed.some((root) => isContained(root, projectRealPath))) {
    return {
      code: "TN_MCP_PROJECT_ROOT_REJECTED",
      message: "MCP authoring tools can only target the configured project root allowlist.",
      path: projectRoot,
    };
  }
  return undefined;
}

async function validateToolPaths(name: AuthoringMcpToolName, args: Record<string, unknown>, projectRoot: string): Promise<{ code: string; message: string; path: string } | undefined> {
  if (name === "asset.generate_blender") {
    const recipe = args.recipe;
    if (typeof recipe === "string") {
      const invalidRecipePath = await validateContainedPath(projectRoot, "recipe", recipe, /^content\/generators\/[a-z][a-z0-9._-]*\.recipe\.json$/u);
      if (invalidRecipePath !== undefined) return invalidRecipePath;
    } else if (containsForbiddenRecipeField(recipe)) {
      return { code: "TN_MCP_ARGUMENT_INVALID", message: "MCP Blender recipes cannot contain Python, code, scripts, modules, add-ons, operators, or remote URLs.", path: "recipe" };
    }
    const out = optionalStringArg(args, "out") ?? `assets/generated/${stringArg(args, "assetId")}.glb`;
    const invalidOutputPath = await validateContainedPath(projectRoot, "out", out, /^assets\/generated\/[a-z][a-z0-9._-]*\.glb$/u);
    if (invalidOutputPath !== undefined) return invalidOutputPath;
  }
  if (name === "asset.hyper3d_generate" && typeof args.image === "string") {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(args.image)) return { code: "TN_MCP_PATH_REJECTED", message: "MCP Hyper3D image input must be a project-local path, not a remote URL.", path: args.image };
    if (/(?:^|\/)(?:dist|artifacts|runtime|\.cache)(?:\/|$)|\.bundle\//u.test(args.image)) return { code: "TN_MCP_GENERATED_SOURCE_REJECTED", message: "MCP Hyper3D image input must not target generated bundle, artifact, cache, or runtime paths.", path: args.image };
    const invalidImagePath = await validateContainedPath(projectRoot, "image", args.image, /^(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]+\.(?:jpe?g|png|webp)$/u);
    if (invalidImagePath !== undefined) return invalidImagePath;
  }
  if ((name === "asset.inspect" || name === "asset.model_test") && typeof args.assetPath === "string") {
    const invalidAssetPath = await validateContainedPath(projectRoot, "assetPath", args.assetPath, /^(?:assets|content)\/[^\\]+\.(?:glb|gltf)$/u);
    if (invalidAssetPath !== undefined) return invalidAssetPath;
  }
  if (name === "asset.model_test") {
    const invalidOutput = await validateContainedPath(projectRoot, "modelTestOutput", "artifacts/mcp-model-test", /^artifacts\/mcp-model-test$/u);
    if (invalidOutput !== undefined) return invalidOutput;
  }
  const pathArgs = [
    ...(name === "scene.attach_script" ? [["modulePath", stringArg(args, "modulePath")] as const] : []),
    ...(name === "system.attach_script" ? [["modulePath", stringArg(args, "modulePath")] as const] : []),
    ...(name === "bundle.import" ? [["bundleDir", stringArg(args, "bundleDir")] as const] : []),
    ...(name === "project.screenshot" ? [["out", stringArg(args, "out")] as const] : []),
  ];
  for (const [key, value] of pathArgs) {
    const resolved = resolve(projectRoot, value);
    if (value.includes("..") || value.includes("\\") || (!resolved.startsWith(`${projectRoot}${sep}`) && resolved !== projectRoot)) {
      return { code: "TN_MCP_PATH_REJECTED", message: `MCP tool argument '${key}' must stay inside the project root.`, path: value };
    }
    if (key !== "bundleDir" && /(?:^|\/)(?:dist|artifacts|runtime|\.cache)(?:\/|$)|\.bundle\//.test(value)) {
      return { code: "TN_MCP_GENERATED_SOURCE_REJECTED", message: `MCP tool argument '${key}' must not target generated bundle, artifact, cache, or runtime paths.`, path: value };
    }
  }
  return undefined;
}

function commandMcpAdapter(name: AuthoringMcpToolName): ICommandMcpAdapterDefinition | undefined {
  return Object.values(CLI_COMMAND_REGISTRY).flatMap((command) => command.adapters?.mcp === undefined ? [] : Array.isArray(command.adapters.mcp) ? command.adapters.mcp : [command.adapters.mcp]).find((adapter) => adapter.name === name);
}

function validateCommandMcpArguments(adapter: ICommandMcpAdapterDefinition, args: Record<string, unknown>): void {
  const schema = adapter.inputSchema;
  const properties = isRecord(schema?.properties) ? schema.properties : {};
  const unknown = Object.keys(args).filter((key) => !(key in properties)).sort();
  if (unknown.length > 0) throw new Error(`MCP tool '${adapter.name}' does not accept argument '${unknown[0]}'.`);
  const required = Array.isArray(schema?.required) ? schema.required : [];
  for (const key of required) {
    if (typeof key === "string" && args[key] === undefined) throw new Error(`MCP argument '${key}' is required.`);
  }
  for (const [key, property] of Object.entries(properties)) {
    if (args[key] !== undefined && isRecord(property)) {
      const pathArgument = adapter.argv?.arguments.some((argument) => argument.name === key && argument.resolveProjectPath === true) === true || ["image", "out", "recipe"].includes(key);
      if (key === "recipe" && typeof args[key] === "string") validateJsonSchemaValue(args[key], { type: "string" }, key);
      else if (pathArgument && typeof property.pattern === "string") { const { pattern: _pattern, ...withoutPathPattern } = property; validateJsonSchemaValue(args[key], withoutPathPattern, key); }
      else validateJsonSchemaValue(args[key], property, key);
    }
  }
  if (adapter.name === "asset.hyper3d_generate") {
    const hasPrompt = args.prompt !== undefined;
    const hasImage = args.image !== undefined;
    if (hasPrompt === hasImage) throw new Error("MCP tool 'asset.hyper3d_generate' requires exactly one of 'prompt' or 'image'.");
  }
  if (adapter.name === "asset.generate_blender") {
    const earlyDiagnostic = validateEarlyCommandArguments(adapter.name, args);
    if (earlyDiagnostic !== undefined) throw new Error(earlyDiagnostic.message);
    if (typeof args.recipe !== "string" && !isRecord(args.recipe)) throw new Error("MCP argument 'recipe' must be a project-local recipe path or recipe object.");
    const overwritePolicy = optionalStringArg(args, "overwritePolicy");
    if (overwritePolicy !== undefined && !["manual", "replace", "skip"].includes(overwritePolicy)) throw new Error("MCP argument 'overwritePolicy' must be manual, replace, or skip.");
    if (args.out !== undefined) stringArg(args, "out");
  }
}

function validateJsonSchemaValue(value: unknown, schema: Record<string, unknown>, key: string): void {
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => isRecord(candidate) && jsonSchemaValueMatches(value, candidate)).length;
    if (matches !== 1) throw new Error(`MCP argument '${key}' must match exactly one allowed schema.`);
    return;
  }
  if (!jsonSchemaValueMatches(value, schema)) throw new Error(`MCP argument '${key}' does not satisfy its declared schema.`);
}

function jsonSchemaValueMatches(value: unknown, schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.filter((candidate) => isRecord(candidate) && jsonSchemaValueMatches(value, candidate)).length === 1;
  }
  if ("const" in schema && value !== schema.const) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) return false;
  } else if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) return false;
  } else if (schema.type === "boolean" && typeof value !== "boolean") return false;
  else if (schema.type === "object") {
    if (!isRecord(value)) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((key): key is string => typeof key === "string") : [];
    if (required.some((key) => value[key] === undefined)) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in properties))) return false;
    if (Object.entries(properties).some(([key, property]) => value[key] !== undefined && isRecord(property) && !jsonSchemaValueMatches(value[key], property))) return false;
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (isRecord(schema.items) && value.some((item) => !jsonSchemaValueMatches(item, schema.items as Record<string, unknown>))) return false;
  }
  return true;
}

function batchOperationSchema(name: AuthoringOperationName): Record<string, unknown> {
  const descriptor = getAuthoringOperationDescriptor(name);
  if (descriptor === undefined) throw new Error(`Registered authoring operation '${name}' has no descriptor.`);
  const requiredArguments = descriptor.arguments.filter((argument) => argument.required).map((argument) => argument.name);
  return {
    additionalProperties: false,
    properties: {
      args: {
        additionalProperties: false,
        properties: Object.fromEntries(descriptor.arguments.map((argument) => [argument.name, batchArgumentSchema(argument)])),
        ...(requiredArguments.length === 0 ? {} : { required: requiredArguments }),
        type: "object",
      },
      name: { const: name, type: "string" },
    },
    required: ["name", ...(requiredArguments.length === 0 ? [] : ["args"])],
    type: "object",
  };
}

function batchArgumentSchema(argument: IAuthoringOperationArgumentDescriptor): Record<string, unknown> {
  const numberConstraints = {
    ...(argument.constraints?.max === undefined ? {} : { maximum: argument.constraints.max }),
    ...(argument.constraints?.min === undefined ? {} : { minimum: argument.constraints.min }),
  };
  const stringSchema = {
    ...(argument.constraints?.enumValues === undefined ? {} : { enum: argument.constraints.enumValues }),
    minLength: 1,
    type: "string",
  };
  switch (argument.type) {
    case "boolean": return { type: "boolean" };
    case "json-object": return { type: "object" };
    case "json-object-array": return { items: { type: "object" }, type: "array" };
    case "json-value": return {};
    case "number": return { ...numberConstraints, type: "number" };
    case "number-array": return { items: { type: "number" }, type: "array" };
    case "string": return stringSchema;
    case "string-array": return { items: stringSchema, type: "array" };
    case "vector3": return { items: { type: "number" }, maxItems: 3, minItems: 3, type: "array" };
  }
}

function isAuthoringBatchTool(name: AuthoringMcpToolName): name is "authoring.batch.apply" | "authoring.batch.plan" {
  return name === "authoring.batch.apply" || name === "authoring.batch.plan";
}

function validateEarlyCommandArguments(name: AuthoringMcpToolName, args: Record<string, unknown>): { code: string; message: string; path: string } | undefined {
  if (name !== "asset.generate_blender") return undefined;
  const adapter = commandMcpAdapter(name);
  const properties = isRecord(adapter?.inputSchema?.properties) ? adapter.inputSchema.properties : undefined;
  const assetIdSchema = properties === undefined || !isRecord(properties.assetId) ? undefined : properties.assetId;
  const pattern = assetIdSchema?.pattern;
  const assetId = args.assetId;
  if (typeof pattern !== "string") {
    return { code: "TN_MCP_DESCRIPTOR_INVALID", message: "The asset.generate_blender descriptor is missing its assetId pattern.", path: "asset.generate_blender" };
  }
  if (typeof assetId !== "string" || !new RegExp(pattern, "u").test(assetId)) {
    return { code: "TN_MCP_ARGUMENT_INVALID", message: `MCP argument 'assetId' must match ${pattern}.`, path: "assetId" };
  }
  return undefined;
}

function stringCommandArgument(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`MCP argument '${key}' must be a non-empty string.`);
  return value;
}

function commandAdapterArgument(value: unknown, key: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  return stringCommandArgument(value, key);
}

async function validateContainedPath(projectRoot: string, key: string, value: string, expected: RegExp): Promise<{ code: string; message: string; path: string } | undefined> {
  const resolved = resolve(projectRoot, value);
  if (value.includes("..") || value.includes("\\") || !expected.test(value) || (!resolved.startsWith(`${projectRoot}${sep}`) && resolved !== projectRoot)) {
    return { code: "TN_MCP_PATH_REJECTED", message: `MCP tool argument '${key}' must stay in its bounded project source path.`, path: value };
  }
  const projectRealPath = await realpath(projectRoot).catch(() => undefined);
  const candidateRealPath = await resolveThroughExistingAncestor(resolved);
  if (projectRealPath === undefined || candidateRealPath === undefined || !isContained(projectRealPath, candidateRealPath)) {
    return { code: "TN_MCP_PATH_REJECTED", message: `MCP tool argument '${key}' resolves outside the allowed project root.`, path: value };
  }
  return undefined;
}

async function resolveThroughExistingAncestor(path: string): Promise<string | undefined> {
  let ancestor = path;
  while (true) {
    try {
      const ancestorRealPath = await realpath(ancestor);
      return resolve(ancestorRealPath, relative(ancestor, path));
    } catch {
      const parent = dirname(ancestor);
      if (parent === ancestor) return undefined;
      ancestor = parent;
    }
  }
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function containsForbiddenRecipeField(value: unknown): boolean {
  if (typeof value === "string") return /^https?:\/\//iu.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenRecipeField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, item]) => /^(?:python|code|script|module|addon|add-on|operator|driver)$/iu.test(key) || containsForbiddenRecipeField(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mcpDiagnostic(diagnostic: { code: string; message: string; path: string }, argv: string[] = []): IAuthoringMcpResult {
  return {
    cli: { argv, exitCode: 1 },
    content: {
      code: diagnostic.code,
      diagnostics: [{ ...diagnostic, severity: "error" }],
      message: diagnostic.message,
      ok: false,
    },
    isError: true,
  };
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`MCP argument '${key}' must be a non-empty string.`);
  }
  return value;
}

function optionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function optionalNumberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
