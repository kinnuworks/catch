import { defineConfig } from "vite";

export default defineConfig({
  root: "src/demo",
  base: "./",
  build: { outDir: "../../dist/demo", emptyOutDir: true, target: "es2022" },
  server: { port: 5173 },
  worker: { format: "es" },
});
