# Player website (ADR 0072, 0073, 0074).
# Build context is the repo root: docker build -f apps/web/Dockerfile .

FROM node:26-bookworm-slim AS build

RUN npm install -g corepack@0.36.0 && corepack enable && corepack prepare pnpm@12.16.1 --activate

WORKDIR /src
ENV NUXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web apps/web
COPY apps/server/package.json apps/server/package.json
COPY apps/companion/package.json apps/companion/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile --filter @unbored/web...
RUN pnpm --filter @unbored/web build

FROM node:26-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NUXT_TELEMETRY_DISABLED=1

COPY --from=build /src/apps/web/.output ./

EXPOSE 3000

# /health belongs to the Server. This process answers /ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server/index.mjs"]
