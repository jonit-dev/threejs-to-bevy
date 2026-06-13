import { createReadStream } from "node:fs";
import type { Socket } from "node:net";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBundle } from "@threenative/compiler";
import { createServer, type Plugin, type ViteDevServer } from "vite";

export interface IWebPreviewServer {
  close(): Promise<void>;
  url: string;
}

export async function startWebPreview(options: {
  bundlePath: string;
  host?: string;
  port?: number;
}): Promise<IWebPreviewServer> {
  const report = await validateBundle(options.bundlePath);
  if (!report.ok) {
    throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  }

  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const server = await createServer({
    plugins: [bundlePlugin(options.bundlePath)],
    root,
    optimizeDeps: {
      noDiscovery: true,
    },
    server: {
      host: options.host ?? "127.0.0.1",
      middlewareMode: false,
      port: options.port ?? 0,
      strictPort: false,
    },
  });
  const sockets = new Set<Socket>();
  server.httpServer?.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? `http://${options.host ?? "127.0.0.1"}:${getPort(server)}/`;
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
    url,
  };
}

function bundlePlugin(bundlePath: string): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use("/bundle", (request, response, next) => {
        const url = request.url ?? "/";
        if (url.includes("..")) {
          response.statusCode = 400;
          response.end("Invalid bundle path");
          return;
        }

        const filePath = resolve(bundlePath, url.replace(/^\//, ""));
        const stream = createReadStream(filePath);
        response.setHeader("Content-Type", contentTypeForBundleFile(filePath));
        stream.on("error", () => next());
        stream.pipe(response);
      });
    },
    name: "threenative-bundle",
  };
}

export function contentTypeForBundleFile(filePath: string): string {
  switch (extname(filePath)) {
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
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function getPort(server: ViteDevServer): number {
  const address = server.httpServer?.address();
  return typeof address === "object" && address !== null ? address.port : 0;
}
