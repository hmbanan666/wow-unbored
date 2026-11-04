import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls: false } })],
  resolve: { alias: { "#shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  test: {
    include: ["apps/web/test/components/**/*.spec.ts"],
    environment: "happy-dom",
    setupFiles: ["apps/web/test/components/setup.ts"],
    maxWorkers: 2,
  },
});
