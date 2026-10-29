# 0023. Monorepo layout

Status: accepted

The repository is one pnpm workspace. The addon stays Lua under `addon/` (not a JavaScript package). The Server is `apps/server`, the Companion is `apps/companion` (its window is a workspace package; the Rust app stays in `src-tauri`), and shared Request, Plan, and Player profile types live in `packages/contracts`, which the Server and the Companion window import. `apps/web` is only a placeholder for a future player website. The BigWigs packager still needs `Unbored.toc` at the checkout root, so the release job copies the addon there for that job only; the zip players install is unchanged.
