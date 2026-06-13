import { chmod, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

interface ICreateOptions {
  cwd?: string;
}

const templateRoot = fileURLToPath(new URL("../../../../templates/v1/", import.meta.url));
const repoRoot = resolve(templateRoot, "../..");
const cliBin = resolve(repoRoot, "packages/cli/dist/index.js");

export async function createProject(argv: readonly string[], options: ICreateOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const templateFlagIndex = normalizedArgv.indexOf("--template");
  const template = templateFlagIndex === -1 ? "v1" : normalizedArgv[templateFlagIndex + 1];
  const destinationArg = normalizedArgv.find((arg, index) => {
    const previous = normalizedArgv[index - 1];
    return !arg.startsWith("-") && previous !== "--template";
  });

  if (destinationArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_CREATE_DESTINATION_REQUIRED",
        message: "Usage: tn create <name> [--template v1] [--json]",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  if (template !== "v1") {
    return diagnosticResult(
      {
        code: "TN_CREATE_TEMPLATE_UNSUPPORTED",
        message: `Template '${template ?? ""}' is not supported. Use '--template v1'.`,
        template,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const cwd = options.cwd ?? process.cwd();
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

  await mkdir(projectPath, { recursive: true });
  await cp(templateRoot, projectPath, { recursive: true, force: false, errorOnExist: true });
  await rewriteLocalWorkspaceDependencies(projectPath);
  await writeLocalCliShim(projectPath);

  const payload = {
    code: "TN_CREATE_OK",
    message: `Created V1 project at '${projectPath}'.`,
    nextCommands: ["pnpm install", "pnpm run validate", "pnpm run build", "pnpm run verify"],
    path: projectPath,
    template: "v1",
  };

  if (json) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  return {
    exitCode: 0,
    stdout: `${payload.message}\nNext: cd ${projectPath} && pnpm install && pnpm run validate\n`,
  };
}

async function rewriteLocalWorkspaceDependencies(projectPath: string): Promise<void> {
  const packageJsonPath = resolve(projectPath, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  packageJson.dependencies = {
    ...packageJson.dependencies,
    "@threenative/sdk": `file:${resolve(repoRoot, "packages/sdk")}`,
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@threenative/cli": `file:${resolve(repoRoot, "packages/cli")}`,
  };

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function writeLocalCliShim(projectPath: string): Promise<void> {
  const binDir = resolve(projectPath, "node_modules/.bin");
  const shimPath = resolve(binDir, "tn");

  await mkdir(binDir, { recursive: true });
  await writeFile(shimPath, `#!/usr/bin/env sh\nexec node ${JSON.stringify(cliBin)} "$@"\n`);
  await chmod(shimPath, 0o755);
}
