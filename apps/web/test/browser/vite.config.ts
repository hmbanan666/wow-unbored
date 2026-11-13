import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
  plugins: [vue()],
  resolve: { alias: { "#shared": fileURLToPath(new URL("../../shared", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 4178, strictPort: true },
});
