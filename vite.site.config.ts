import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/site",
  base: "./",
  build: {
    outDir: "../../dist/site",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: { index: resolve("src/site/index.html"), pomelo: resolve("src/site/pomelo.html") } },
  },
  server: { port: 5180 },
});
