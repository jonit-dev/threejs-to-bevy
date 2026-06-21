import { readFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";

import { applyEditorOperationApi } from "./src/server/operationApi.js";
import { buildEditorPreviewApi } from "./src/server/buildApi.js";
import { loadEditorProjectApi } from "./src/server/projectApi.js";

interface IBootConfig {
  projectPath?: string;
}

export default defineConfig({
  plugins: [editorApiPlugin()],
});

function editorApiPlugin(): Plugin {
  return {
    name: "threenative-editor-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        try {
          if (request.url === "/api/project" && request.method === "GET") {
            const boot = await readBootConfig();
            const result = await loadEditorProjectApi({ projectPath: boot.projectPath ?? process.cwd(), rootPath: boot.projectPath });
            return json(response, result);
          }
          if (request.url === "/api/operation" && request.method === "POST") {
            const boot = await readBootConfig();
            const body = await readJsonBody(request);
            const result = await applyEditorOperationApi({ projectPath: boot.projectPath ?? process.cwd(), request: body, rootPath: boot.projectPath });
            return json(response, result);
          }
          if (request.url === "/api/build" && request.method === "POST") {
            const boot = await readBootConfig();
            const result = await buildEditorPreviewApi({ projectPath: boot.projectPath ?? process.cwd() });
            return json(response, result);
          }
        } catch (error) {
          response.statusCode = 500;
          return json(response, {
            diagnostics: [{ code: "TN_EDITOR_API_FAILED", message: error instanceof Error ? error.message : String(error), severity: "error" }],
            ok: false,
          });
        }
        next();
      });
    },
  };
}

async function readBootConfig(): Promise<IBootConfig> {
  const bootPath = process.env.THREENATIVE_EDITOR_BOOT;
  if (bootPath === undefined) {
    return {};
  }
  return JSON.parse(await readFile(bootPath, "utf8")) as IBootConfig;
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<{ args: Record<string, unknown>; name: string; projectRevision?: string }> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as { args: Record<string, unknown>; name: string; projectRevision?: string };
}

function json(response: import("node:http").ServerResponse, payload: unknown): void {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}
