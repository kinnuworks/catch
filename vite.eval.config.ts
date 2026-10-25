import { defineConfig } from "vite";

// The browser eval runs for many minutes on a 3 GB model; no live reload, so editing
// source files can't restart it halfway.
export default defineConfig({
  root: "src/demo",
  server: { port: 5190, hmr: false, watch: { ignored: ["**/*"] } },
});
