FROM node:26-bookworm-slim

# Node 26 does not ship corepack. Install it, then pin pnpm.
RUN npm install -g corepack@0.36.0 && corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/companion/package.json apps/companion/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile --filter @unbored/server... --prod

COPY apps/server/src apps/server/src
COPY apps/server/docker-entrypoint.sh /usr/local/bin/unbored-entrypoint
COPY packages/contracts packages/contracts

ENV PORT=3000
ENV UNBORED_DATA_DIR=/data

RUN mkdir -p /data && chmod 755 /usr/local/bin/unbored-entrypoint

WORKDIR /src/apps/server

EXPOSE 3000
VOLUME ["/data"]

# Starts as root so the entrypoint can chown a Dokploy volume that was created
# as root, then drops to the node user. A plain USER node cannot write that volume.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/unbored-entrypoint"]
CMD ["node", "--experimental-sqlite", "--experimental-strip-types", "src/index.ts"]
