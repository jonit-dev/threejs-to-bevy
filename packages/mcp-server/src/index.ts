import { resolve, sep } from "node:path";

import { dispatch } from "@threenative/cli";

export type AuthoringMcpToolName =
  | "project.build"
  | "project.screenshot"
  | "project.verify"
  | "scene.add_entity"
  | "scene.attach_script"
  | "scene.bind_ui"
  | "scene.inspect"
  | "scene.set_camera"
  | "scene.set_transform"
  | "scene.validate";

export interface IAuthoringMcpToolCall {
  arguments?: Record<string, unknown>;
  name: AuthoringMcpToolName;
}

export interface IAuthoringMcpOptions {
  allowedProjectRoots?: readonly string[];
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

export const AUTHORING_MCP_TOOLS: Array<{ description: string; name: AuthoringMcpToolName }> = [
  { description: "Inspect a source scene document through tn scene inspect --json.", name: "scene.inspect" },
  { description: "Validate source scene documents through tn scene validate --json.", name: "scene.validate" },
  { description: "Add an entity through tn scene add-entity --json.", name: "scene.add_entity" },
  { description: "Set an entity transform through tn scene set-transform --json.", name: "scene.set_transform" },
  { description: "Set scene camera metadata through tn scene set-camera --json.", name: "scene.set_camera" },
  { description: "Attach a script source module through tn scene attach-script --json.", name: "scene.attach_script" },
  { description: "Bind a UI node through tn scene bind-ui --json.", name: "scene.bind_ui" },
  { description: "Build the project through tn build --json.", name: "project.build" },
  { description: "Capture a screenshot through tn screenshot --json.", name: "project.screenshot" },
  { description: "Run visual verification through tn verify --json.", name: "project.verify" },
];

export async function callAuthoringMcpTool(call: IAuthoringMcpToolCall, options: IAuthoringMcpOptions): Promise<IAuthoringMcpResult> {
  const projectRoot = resolve(options.projectRoot);
  const guard = validateProjectRoot(projectRoot, options.allowedProjectRoots ?? [process.cwd()]);
  if (guard !== undefined) {
    return mcpDiagnostic(guard);
  }
  const args = call.arguments ?? {};
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
  const invalidPath = validateToolPaths(call.name, args, projectRoot);
  if (invalidPath !== undefined) {
    return mcpDiagnostic(invalidPath, argv);
  }
  const result = await dispatch(argv);
  return commandResultToMcp(result, argv);
}

function toolToCliArgv(name: AuthoringMcpToolName, args: Record<string, unknown>, projectRoot: string): string[] {
  const project = ["--project", projectRoot];
  if (name === "scene.inspect") {
    return ["scene", "inspect", stringArg(args, "sceneId"), ...project, "--json"];
  }
  if (name === "scene.validate") {
    const sceneId = optionalStringArg(args, "sceneId");
    return ["scene", "validate", ...(sceneId === undefined ? [] : [sceneId]), ...project, "--json"];
  }
  if (name === "scene.add_entity") {
    const prefabId = optionalStringArg(args, "prefabId");
    return ["scene", "add-entity", stringArg(args, "sceneId"), stringArg(args, "entityId"), ...(prefabId === undefined ? [] : ["--prefab", prefabId]), ...project, "--json"];
  }
  if (name === "scene.set_transform") {
    const transform = recordArg(args, "transform");
    return [
      "scene",
      "set-transform",
      stringArg(args, "sceneId"),
      stringArg(args, "entityId"),
      ...vectorFlag("--position", transform.position),
      ...vectorFlag("--rotation", transform.rotation),
      ...vectorFlag("--scale", transform.scale),
      ...project,
      "--json",
    ];
  }
  if (name === "scene.set_camera") {
    return ["scene", "set-camera", stringArg(args, "sceneId"), stringArg(args, "cameraId"), "--mode", stringArg(args, "mode"), "--target", stringArg(args, "targetId"), ...project, "--json"];
  }
  if (name === "scene.attach_script") {
    return ["scene", "attach-script", stringArg(args, "sceneId"), stringArg(args, "systemId"), "--module", stringArg(args, "modulePath"), "--export", stringArg(args, "exportName"), ...project, "--json"];
  }
  if (name === "scene.bind_ui") {
    return ["scene", "bind-ui", stringArg(args, "sceneId"), stringArg(args, "uiNodeId"), "--resource", stringArg(args, "resourcePath"), ...project, "--json"];
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

function commandResultToMcp(result: ICommandResult, argv: string[]): IAuthoringMcpResult {
  const raw = result.stdout.length > 0 ? result.stdout : result.stderr ?? "";
  let content: unknown = raw;
  try {
    content = JSON.parse(raw);
  } catch {
    // Human output remains useful when a CLI path has not yet gained JSON.
  }
  return {
    cli: { argv, exitCode: result.exitCode },
    content,
    isError: result.exitCode !== 0,
  };
}

function validateProjectRoot(projectRoot: string, allowedProjectRoots: readonly string[]): { code: string; message: string; path: string } | undefined {
  const allowed = allowedProjectRoots.map((root) => resolve(root));
  if (!allowed.some((root) => projectRoot === root || projectRoot.startsWith(`${root}${sep}`))) {
    return {
      code: "TN_MCP_PROJECT_ROOT_REJECTED",
      message: "MCP authoring tools can only target the configured project root allowlist.",
      path: projectRoot,
    };
  }
  return undefined;
}

function validateToolPaths(name: AuthoringMcpToolName, args: Record<string, unknown>, projectRoot: string): { code: string; message: string; path: string } | undefined {
  const pathArgs = [
    ...(name === "scene.attach_script" ? [["modulePath", stringArg(args, "modulePath")] as const] : []),
    ...(name === "project.screenshot" ? [["out", stringArg(args, "out")] as const] : []),
  ];
  for (const [key, value] of pathArgs) {
    const resolved = resolve(projectRoot, value);
    if (value.includes("..") || value.includes("\\") || (!resolved.startsWith(`${projectRoot}${sep}`) && resolved !== projectRoot)) {
      return { code: "TN_MCP_PATH_REJECTED", message: `MCP tool argument '${key}' must stay inside the project root.`, path: value };
    }
    if (/(?:^|\/)(?:dist|artifacts|runtime|\.cache)(?:\/|$)|\.bundle\//.test(value)) {
      return { code: "TN_MCP_GENERATED_SOURCE_REJECTED", message: `MCP tool argument '${key}' must not target generated bundle, artifact, cache, or runtime paths.`, path: value };
    }
  }
  return undefined;
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

function recordArg(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`MCP argument '${key}' must be an object.`);
  }
  return value as Record<string, unknown>;
}

function vectorFlag(flag: string, value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length !== 3 || !value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`MCP transform '${flag}' must be a finite [x,y,z] tuple.`);
  }
  return [flag, value.join(",")];
}
