import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CompilerError } from "./errors.js";

export interface IProjectConfig {
  entry: string;
  outDir: string;
  projectPath: string;
  schema: "threenative.project";
  version: "0.1.0";
}

export async function loadProjectConfig(projectPath: string): Promise<IProjectConfig> {
  const configPath = resolve(projectPath, "threenative.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as Partial<IProjectConfig>;

  if (config.schema !== "threenative.project" || config.version !== "0.1.0" || config.entry === undefined) {
    throw new CompilerError("TN_COMPILER_CONFIG_INVALID", "Project config must be threenative.project version 0.1.0.");
  }

  return {
    entry: config.entry,
    outDir: config.outDir ?? "dist/game.bundle",
    projectPath,
    schema: "threenative.project",
    version: "0.1.0",
  };
}
