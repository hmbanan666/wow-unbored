import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["apps/server/test/**/*.test.ts", "packages/contracts/src/**/*.test.ts"],
    environment: "node",
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
    ],
  },
});
