import { defineConfig } from "vite";

export default defineConfig({
  root: "overlay",
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
