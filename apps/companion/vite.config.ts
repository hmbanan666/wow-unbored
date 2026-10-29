import { defineConfig } from "vite-plus";

// Tauri loads the built window from dist/. base "./" keeps the asset paths
// working inside the Companion, and 1420 is the port Tauri opens.
export default defineConfig({
  root: "ui",
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2021",
  },
});
