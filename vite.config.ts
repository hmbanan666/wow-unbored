import { defineConfig } from "vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "#shared": fileURLToPath(new URL("./apps/web/shared", import.meta.url)),
    },
  },
  test: {
    include: [
      "apps/server/test/**/*.test.ts",
      "packages/contracts/src/**/*.test.ts",
      "apps/web/test/**/*.test.ts",
    ],
    environment: "node",
    maxWorkers: 2,
    execArgv: ["--experimental-sqlite"],
  },
  lint: {
    ignorePatterns: [
      "addon/**",
      "apps/companion/src-tauri/**",
      "docs/**",
      "art/**",
      "**/*.lua",
      "**/*.md",
      "apps/web/.nuxt/**",
      "apps/web/.output/**",
    ],
  },
  fmt: {
    ignorePatterns: [
      "packages/contracts/catalog/catalog.json",
      "addon/**",
      "apps/companion/src-tauri/**",
      "docs/**",
      "art/**",
      "**/*.lua",
      "**/*.md",
      "apps/web/.nuxt/**",
      "apps/web/.output/**",
    ],
  },
});
