import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

import { applyEditorOperationApi } from "./src/server/operationApi.js";
import { applyEditorChatApi, planEditorChatApi } from "./src/server/chatApi.js";
import { buildEditorPreviewApi } from "./src/server/buildApi.js";
import { loadEditorProjectApi } from "./src/server/projectApi.js";
import { listEditorScriptSources, readEditorScriptSource, scaffoldEditorScriptSource, writeEditorScriptSource } from "./src/server/scriptSourceApi.js";

interface IBootConfig {
  projectPath?: string;
}

const require = createRequire(import.meta.url);
const dracoDecoderRoot = dirname(require.resolve("three/examples/jsm/libs/draco/draco_decoder.wasm"));

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
          if (request.url?.startsWith("/api/scripts") === true) {
            const boot = await readBootConfig();
            const projectPath = boot.projectPath ?? process.cwd();
            if (request.method === "GET") {
              const path = new URL(request.url, "http://editor.local").searchParams.get("path");
              const result = path === null
                ? await listEditorScriptSources({ projectPath, rootPath: boot.projectPath })
                : await readEditorScriptSource({ path, projectPath, rootPath: boot.projectPath });
              return json(response, result);
            }
            if (request.method === "POST") {
              const body = await readJsonBody<{ exportName: string; path: string }>(request);
              const result = await scaffoldEditorScriptSource({ exportName: body.exportName, path: body.path, projectPath, rootPath: boot.projectPath });
              return json(response, result);
            }
            if (request.method === "PUT") {
              const body = await readJsonBody<{ body: string; path: string }>(request);
              const result = await writeEditorScriptSource({ body: body.body, path: body.path, projectPath, rootPath: boot.projectPath });
              return json(response, result);
            }
          }
          if (request.url === "/api/ai/plan" && request.method === "POST") {
            const boot = await readBootConfig();
            const body = await readJsonBody(request);
            const result = await planEditorChatApi({ projectPath: boot.projectPath ?? process.cwd(), request: body, rootPath: boot.projectPath });
            return json(response, result);
          }
          if (request.url === "/api/ai/apply" && request.method === "POST") {
            const boot = await readBootConfig();
            const body = await readJsonBody(request);
            const result = await applyEditorChatApi({ projectPath: boot.projectPath ?? process.cwd(), request: body, rootPath: boot.projectPath });
            return json(response, result);
          }
          if (request.url === "/api/build" && request.method === "POST") {
            const boot = await readBootConfig();
            const result = await buildEditorPreviewApi({ projectPath: boot.projectPath ?? process.cwd() });
            return json(response, result);
          }
          if (request.url?.startsWith("/draco/") === true && request.method === "GET") {
            const decoderFile = decodeURIComponent(request.url.slice("/draco/".length).split("?")[0] ?? "");
            const decoderPath = resolve(dracoDecoderRoot, decoderFile);
            const decoderRelative = relative(dracoDecoderRoot, decoderPath).split("\\").join("/");
            if (decoderRelative.startsWith("../") || decoderRelative === ".." || decoderRelative.startsWith("/")) {
              response.statusCode = 403;
              return response.end("Forbidden");
            }
            response.setHeader("content-type", contentTypeForAsset(decoderPath));
            return response.end(await readFile(decoderPath));
          }
          if (request.url?.startsWith("/project-assets/") === true && request.method === "GET") {
            const boot = await readBootConfig();
            const projectPath = resolve(boot.projectPath ?? process.cwd());
            const assetRelative = decodeURIComponent(request.url.slice("/project-assets/".length).split("?")[0] ?? "");
            const assetPath = resolve(projectPath, assetRelative);
            const projectRelative = relative(projectPath, assetPath).split("\\").join("/");
            if (projectRelative.startsWith("../") || projectRelative === ".." || projectRelative.startsWith("/")) {
              response.statusCode = 403;
              return response.end("Forbidden");
            }
            response.setHeader("content-type", contentTypeForAsset(assetPath));
            return response.end(await readFile(assetPath));
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

function contentTypeForAsset(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

async function readBootConfig(): Promise<IBootConfig> {
  const bootPath = process.env.THREENATIVE_EDITOR_BOOT;
  if (bootPath === undefined) {
    return {};
  }
  return JSON.parse(await readFile(bootPath, "utf8")) as IBootConfig;
}

async function readJsonBody<T = unknown>(request: import("node:http").IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function json(response: import("node:http").ServerResponse, payload: unknown): void {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}
