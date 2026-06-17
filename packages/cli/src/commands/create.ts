import { access, chmod, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import {
  formatTemplateUsage,
  resolveTemplate,
  resolveTemplateSourcePath,
  templateDeprecationMessage,
  templatesRootFromModule,
} from "../templates/registry.js";

interface ICreateOptions {
  cwd?: string;
}

const moduleUrl = import.meta.url;
const { packaged: packagedTemplatesRoot, source: sourceTemplatesRoot } = templatesRootFromModule(moduleUrl);
const repoRoot = resolve(sourceTemplatesRoot, "..");
const cliBin = resolve(repoRoot, "packages/cli/dist/index.js");
const publishedPackageVersion = "0.1.0";

export async function createProject(argv: readonly string[], options: ICreateOptions = {}): Promise<ICommandResult> {
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
        message: `Usage: tn create <name> [${formatTemplateUsage()}] [--json]`,
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

  const { definition, legacyAliasUsed } = resolvedTemplate;
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
    await writeLocalCliShim(projectPath);
  } else {
    await rewritePublishedDependencies(projectPath);
  }

  const payload = {
    code: "TN_CREATE_OK",
    legacyAliasUsed,
    legacyTemplate: legacyAliasUsed ? requestedTemplate : undefined,
    message: `Created ${definition.canonical} project at '${projectPath}'.`,
    nextCommands: ["pnpm install", "pnpm run validate", "pnpm run build", "pnpm run verify"],
    path: projectPath,
    template: definition.canonical,
  };

  if (json) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  const deprecation = legacyAliasUsed && requestedTemplate
    ? `${templateDeprecationMessage(requestedTemplate, definition.canonical)}\n`
    : "";

  return {
    exitCode: 0,
    stdout: `${deprecation}${payload.message}\nNext: cd ${projectPath} && pnpm install && pnpm run validate\n`,
  };
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
  packageJson.dependencies = rewriteDependency(packageJson.dependencies, "@threenative/r3f", "packages/r3f", {
    onlyIfPresent: true,
  });
  packageJson.dependencies = rewriteDependency(packageJson.dependencies, "@threenative/ui", "packages/ui", {
    onlyIfPresent: true,
  });
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@threenative/cli": `file:${resolve(repoRoot, "packages/cli")}`,
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

async function writeLocalCliShim(projectPath: string): Promise<void> {
  const binDir = resolve(projectPath, "node_modules/.bin");
  const shimPath = resolve(binDir, "tn");

  await mkdir(binDir, { recursive: true });
  await writeFile(shimPath, `#!/usr/bin/env sh\nexec node ${JSON.stringify(cliBin)} "$@"\n`);
  await chmod(shimPath, 0o755);
}

async function isSourceCheckout(): Promise<boolean> {
  try {
    await access(resolve(sourceTemplatesRoot, "v1", "package.json"));
    await access(resolve(repoRoot, "packages", "cli", "package.json"));
    return true;
  } catch {
    return false;
  }
}

export {
  formatTemplateUsage,
  listCanonicalTemplates,
  listLegacyTemplateAliases,
  resolveTemplate,
  TEMPLATE_REGISTRY,
} from "../templates/registry.js";
