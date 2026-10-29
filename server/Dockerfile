FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=3000
ENV UNBORED_DATA_DIR=/data

RUN mkdir -p /data

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "--experimental-sqlite", "--experimental-strip-types", "src/index.ts"]
