# Request contract

The payloads the Companion posts and the Server accepts live in [`packages/contracts`](../../packages/contracts). That package holds the TypeScript types, the Zod schemas, and the JSON Schema files. The Rust contract test reads the JSON Schema. The SavedVariables fixtures (`plan.lua`, `item.lua`, `question.lua`) and `requests.json` are in `packages/contracts/fixtures`.
