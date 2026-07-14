export type ExternalToolId = "blender";
export type ExternalToolArchiveType = "dmg" | "tar.xz" | "zip";
export type ExternalToolHost = "darwin-arm64" | "darwin-x64" | "linux-x64" | "win32-x64";

export interface IExternalToolArtifact {
  archive: ExternalToolArchiveType;
  archiveFile: string;
  executablePath: string;
  expectedBytes: number;
  host: ExternalToolHost;
  sha256: string;
  url: string;
}

export interface IExternalToolDefinition {
  artifacts: Record<ExternalToolHost, IExternalToolArtifact>;
  id: ExternalToolId;
  license: {
    name: string;
    url: string;
  };
  sourceUrl: string;
  version: string;
  versionProbe: {
    args: readonly string[];
    outputPattern: RegExp;
  };
}

const BLENDER_VERSION = "4.5.11";
const BLENDER_RELEASE = "https://download.blender.org/release/Blender4.5";

export const EXTERNAL_TOOL_REGISTRY: Record<ExternalToolId, IExternalToolDefinition> = {
  blender: {
    artifacts: {
      "darwin-arm64": artifact("darwin-arm64", "dmg", "blender-4.5.11-macos-arm64.dmg", 308_255_028, "1fad76c7da9451c7d6db99f1a5ed3c0a1a461d0aa07bf2b639e2fb4804ca4f13", "Blender.app/Contents/MacOS/Blender"),
      "darwin-x64": artifact("darwin-x64", "dmg", "blender-4.5.11-macos-x64.dmg", 335_831_010, "d5b0e77ab3baf3cfdf8a80847b3b716ec7448ecd8e299564b7f5a934427224fc", "Blender.app/Contents/MacOS/Blender"),
      "linux-x64": artifact("linux-x64", "tar.xz", "blender-4.5.11-linux-x64.tar.xz", 377_898_640, "05ed7bd41bf3e61ae4f4a7cdc364c43088bf8b3fed702c2269c018fdf63a2188", "blender-4.5.11-linux-x64/blender"),
      "win32-x64": artifact("win32-x64", "zip", "blender-4.5.11-windows-x64.zip", 398_922_208, "e11d3a8e4d4249be5a7db4a9325c1f670037d4233467c3b0bda181001efe44d3", "blender-4.5.11-windows-x64/blender.exe"),
    },
    id: "blender",
    license: {
      name: "GNU General Public License v3 or later",
      url: "https://developer.blender.org/docs/license/",
    },
    sourceUrl: "https://download.blender.org/source/",
    version: BLENDER_VERSION,
    versionProbe: {
      args: ["--version"],
      outputPattern: /^Blender 4\.5\.11(?:\s|$)/m,
    },
  },
};

export function externalToolHost(platform: NodeJS.Platform = process.platform, arch: string = process.arch): ExternalToolHost | undefined {
  const host = `${platform}-${arch}`;
  return host === "darwin-arm64" || host === "darwin-x64" || host === "linux-x64" || host === "win32-x64" ? host : undefined;
}

export function getExternalToolDefinition(id: string): IExternalToolDefinition | undefined {
  return id === "blender" ? EXTERNAL_TOOL_REGISTRY.blender : undefined;
}

function artifact(host: ExternalToolHost, archive: ExternalToolArchiveType, archiveFile: string, expectedBytes: number, sha256: string, executablePath: string): IExternalToolArtifact {
  return {
    archive,
    archiveFile,
    executablePath,
    expectedBytes,
    host,
    sha256,
    url: `${BLENDER_RELEASE}/${archiveFile}`,
  };
}

for (const definition of Object.values(EXTERNAL_TOOL_REGISTRY)) {
  for (const [host, value] of Object.entries(definition.artifacts)) {
    if (value.host !== host || value.url === "" || value.sha256.length !== 64 || value.expectedBytes <= 0 || value.executablePath === "" || value.archiveFile === "") {
      throw new Error(`External tool registry row '${definition.id}/${host}' is incomplete.`);
    }
  }
  if (definition.version === "" || definition.license.name === "" || definition.license.url === "" || definition.sourceUrl === "" || definition.versionProbe.args.length === 0) {
    throw new Error(`External tool registry definition '${definition.id}' is incomplete.`);
  }
}
