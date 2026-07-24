import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Socket } from "node:net";
import { extname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBundle } from "@threenative/compiler";
import { createServer, type Plugin, type ViteDevServer } from "vite";

export interface IWebPreviewServer {
  close(): Promise<void>;
  metadata: IWebPreviewMetadata;
  reload(): void;
  url: string;
}

export interface IWebPreviewMetadata {
  buildTime: string;
  bundleHash: string;
  bundlePath: string;
  executedRuntimeBuildHash: string | null;
  runtimeBuildHash: string;
  runtimeEntry: "dist" | "source";
  sourceBuildStatus: "current" | "stale";
}

export async function startWebPreview(options: {
  bundlePath: string;
  host?: string;
  metadata?: Partial<IWebPreviewMetadata>;
  port?: number;
  runtimeRoot?: string;
  silent?: boolean;
}): Promise<IWebPreviewServer> {
  const report = await validateBundle(options.bundlePath);
  if (!report.ok) {
    throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  }

  const metadata = await bundleMetadata(options.bundlePath, options.metadata);
  const root = resolve(options.runtimeRoot ?? fileURLToPath(new URL("..", import.meta.url)));
  const runtime = await resolveRuntimeEntry(root);
  metadata.runtimeBuildHash = await hashRuntimeTree(runtime.directory);
  metadata.runtimeEntry = runtime.kind;
  metadata.executedRuntimeBuildHash = null;
  const server = await createServer({
    plugins: [bundlePlugin(options.bundlePath, metadata, runtime)],
    root,
    logLevel: options.silent === true ? "silent" : "info",
    optimizeDeps: {
      noDiscovery: true,
    },
    server: {
      host: options.host ?? "127.0.0.1",
      middlewareMode: false,
      ...(options.port === undefined || options.port === 0 ? {} : { port: options.port }),
      // An explicitly requested port must never silently drift to a free
      // neighbor: a stale server would keep the requested port while the new
      // one binds elsewhere, so the browser keeps loading the stale build.
      // Port 0 means "any free port" and is exempt.
      strictPort: options.port !== undefined && options.port !== 0,
    },
  });
  const sockets = new Set<Socket>();
  server.httpServer?.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }
  const url = `http://${options.host ?? "127.0.0.1"}:${getPort(server)}/`;
  return {
    close: async () => {
      server.ws.close();
      await server.watcher.close();
      const closeableServer = server.httpServer;
      if (closeableServer != null && "closeAllConnections" in closeableServer) {
        closeableServer.closeAllConnections();
      }
      if (closeableServer != null && "closeIdleConnections" in closeableServer) {
        closeableServer.closeIdleConnections();
      }
      for (const socket of sockets) {
        socket.destroy();
      }
      await server.close();
      await new Promise<void>((resolveClose) => {
        const httpServer = server.httpServer;
        if (httpServer == null || !httpServer.listening) {
          resolveClose();
          return;
        }
        httpServer.close(() => resolveClose());
      });
    },
    metadata,
    reload() {
      server.ws.send({ type: "full-reload" });
    },
    url,
  };
}

async function bundleMetadata(bundlePath: string, overrides: Partial<IWebPreviewMetadata> | undefined): Promise<IWebPreviewMetadata> {
  const manifestPath = resolve(bundlePath, "manifest.json");
  const manifest = await readFile(manifestPath);
  const modified = await stat(manifestPath);
  return {
    buildTime: overrides?.buildTime ?? modified.mtime.toISOString(),
    bundleHash: overrides?.bundleHash ?? createHash("sha256").update(manifest).digest("hex"),
    bundlePath: overrides?.bundlePath ?? bundlePath,
    executedRuntimeBuildHash: overrides?.executedRuntimeBuildHash ?? null,
    runtimeBuildHash: overrides?.runtimeBuildHash ?? "",
    runtimeEntry: overrides?.runtimeEntry ?? "dist",
    sourceBuildStatus: overrides?.sourceBuildStatus ?? "current",
  };
}

interface IRuntimeEntry {
  directory: string;
  importPath: string;
  kind: "dist" | "source";
}

function bundlePlugin(bundlePath: string, metadata: IWebPreviewMetadata, runtime: IRuntimeEntry): Plugin {
  return {
    async transformIndexHtml(html) {
      metadata.runtimeBuildHash = await hashRuntimeTree(runtime.directory);
      return html.replace(
        '<script id="threenative-runtime-entry"></script>',
        `<script type="module">\n${runtimeBootstrap(runtime, metadata.runtimeBuildHash)}</script>`,
      );
    },
    configureServer(server) {
      server.middlewares.use("/__threenative/runtime-executed", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          if (body.length <= 1024) body += chunk;
        });
        request.on("end", () => {
          try {
            const parsed = JSON.parse(body) as unknown;
            if (isRecord(parsed) && typeof parsed.runtimeBuildHash === "string" && /^[a-f0-9]{64}$/u.test(parsed.runtimeBuildHash)) {
              metadata.executedRuntimeBuildHash = parsed.runtimeBuildHash;
              response.statusCode = 204;
              response.end();
              return;
            }
          } catch {
            // Fall through to the bounded invalid-payload response.
          }
          response.statusCode = 400;
          response.end("Invalid runtime identity");
        });
      });
      server.middlewares.use("/__threenative/dev-state.json", async (_request, response) => {
        try {
          metadata.runtimeBuildHash = await hashRuntimeTree(runtime.directory);
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(`${JSON.stringify({
            schema: "threenative.dev-preview-state",
            version: "0.2.0",
            ...metadata,
          }, null, 2)}\n`);
        } catch (error) {
          response.statusCode = 500;
          response.end(error instanceof Error ? error.message : String(error));
        }
      });
      server.middlewares.use("/bundle", (request, response, next) => {
        const filePath = resolveBundleFilePath(bundlePath, request.url ?? "/");
        if (filePath === null) {
          response.statusCode = 400;
          response.end("Invalid bundle path");
          return;
        }

        const stream = createReadStream(filePath);
        response.setHeader("Content-Type", contentTypeForBundleFile(filePath));
        stream.on("error", () => next());
        stream.pipe(response);
      });
    },
    name: "threenative-bundle",
  };
}

function runtimeBootstrap(runtime: IRuntimeEntry, runtimeBuildHash: string): string {
  return `await import(${JSON.stringify(`${runtime.importPath}?runtime=${runtimeBuildHash}`)});\n`
    + `await fetch("/__threenative/runtime-executed", { method: "POST", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify({ runtimeBuildHash }))} });\n`;
}

async function resolveRuntimeEntry(root: string): Promise<IRuntimeEntry> {
  const sourceEntry = resolve(root, "src/browser/main.ts");
  try {
    await stat(sourceEntry);
    return { directory: resolve(root, "src"), importPath: "/src/browser/main.ts", kind: "source" };
  } catch {
    const distEntry = resolve(root, "dist/browser/main.js");
    await stat(distEntry);
    return { directory: resolve(root, "dist"), importPath: "/dist/browser/main.js", kind: "dist" };
  }
}

async function hashRuntimeTree(directory: string): Promise<string> {
  const files: string[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && runtimeIdentityFile(entry.name)) {
        files.push(path);
      }
    }
  }
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    hash.update(relative(directory, path));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function runtimeIdentityFile(name: string): boolean {
  return (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
    || (name.endsWith(".js") && !name.endsWith(".test.js"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveBundleFilePath(bundlePath: string, url: string): string | null {
  const rawPathname = url.split(/[?#]/, 1)[0] ?? "/";
  if (rawPathname.startsWith("//")) {
    return null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.startsWith("//")) {
    return null;
  }
  const root = resolve(bundlePath);
  const normalizedPath = normalize(`.${pathname}`);
  if (normalizedPath === ".." || normalizedPath.startsWith(`..${sep}`) || isAbsolute(normalizedPath)) {
    return null;
  }
  const filePath = resolve(root, normalizedPath);
  const relativePath = relative(root, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }
  return filePath;
}

export function contentTypeForBundleFile(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".gltf":
      return "model/gltf+json; charset=utf-8";
    case ".glb":
      return "model/gltf-binary";
    case ".bin":
      return "application/octet-stream";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
}

function getPort(server: ViteDevServer): number {
  const address = server.httpServer?.address();
  return typeof address === "object" && address !== null ? address.port : 0;
}
