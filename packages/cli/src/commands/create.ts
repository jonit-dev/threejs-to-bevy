import { access, chmod, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
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

export async function createProject(argv: readonly string[], options: ICreateOptions = {}): Promise<ICommandResult> {
  const commandName = options.commandName ?? "create";
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const templateFlagIndex = normalizedArgv.indexOf("--template");
  const requestedTemplate = templateFlagIndex === -1 ? undefined : normalizedArgv[templateFlagIndex + 1];
  const destinationArg = normalizedArgv.find((arg, index) => {
    const previous = normalizedArgv[index - 1];
    return !arg.startsWith("-") && previous !== "--template";
  });

  if (destinationArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_CREATE_DESTINATION_REQUIRED",
        message: `Usage: tn ${commandName} <name> [${formatTemplateUsage()}] [--json]`,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const resolvedTemplate = resolveTemplate(requestedTemplate);
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

  await mkdir(projectPath, { recursive: true });
  await cp(templateSourcePath, projectPath, { recursive: true, force: false });
  await rewriteProjectTemplateMetadata(projectPath, definition.canonical);

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
    nextCommands: ["pnpm install", "pnpm run validate", "pnpm run build", "pnpm run dev:web", "pnpm run verify"],
    path: projectPath,
    referenceDocs: [
      "docs/workflows/developer-workflow.md",
      "docs/workflows/ai-workflows.md",
      "tn help scaffold",
      "tn help visual-qa",
    ],
    template: definition.canonical,
  };

  if (json) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  return {
    exitCode: 0,
    stdout: `${payload.message}\nNext commands:\n  cd ${projectPath}\n  pnpm install\n  pnpm run validate\n  pnpm run build\n  pnpm run dev:web\n  pnpm run verify\nDocs: tn help scaffold, tn help visual-qa\n`,
  };
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
