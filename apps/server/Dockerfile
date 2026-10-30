FROM node:24-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/companion/package.json apps/companion/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile --filter @unbored/server... --prod

COPY apps/server/src apps/server/src
COPY packages/contracts packages/contracts

ENV PORT=3000
ENV UNBORED_DATA_DIR=/data

RUN mkdir -p /data

WORKDIR /src/apps/server

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "--experimental-sqlite", "--experimental-strip-types", "src/index.ts"]
