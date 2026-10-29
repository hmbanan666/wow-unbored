# 0024. Vite+ for JavaScript

Status: accepted

Vite+ 1.0 shipped on 28 September 2026 (MIT, `vite-plus` 1.4.0 as of this decision) and is the JavaScript toolchain: `vp` runs format and lint (Oxfmt, Oxlint), tests (Vitest), and the Companion window build. Lua stays on luacheck, and the Companion's Rust stays on cargo fmt, clippy, and test. Root scripts are `pnpm dev`, `pnpm test`, `pnpm lint`, and `pnpm build`.
