import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  root,
  build: {
    assetsDir: "assets",
    emptyOutDir: true,
    outDir: resolve(root, "../dist"),
    target: "es2018",
    rollupOptions: {
      output: {
        assetFileNames(assetInfo) {
          if (assetInfo.names?.some((name) => name.endsWith(".css"))) {
            return "assets/inventory.css";
          }
          return "assets/[name][extname]";
        },
        chunkFileNames: "assets/[name].js",
        entryFileNames: "assets/inventory-react.js",
      },
    },
  },
  publicDir: resolve(root, "../sprites"),
});
