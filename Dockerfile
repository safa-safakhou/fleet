FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts vitest.config.ts biome.json ./
COPY src ./src
COPY web ./web
COPY vendor ./vendor
COPY migrations ./migrations
COPY tests ./tests
COPY scripts ./scripts
RUN npm run check && npm run check:boundaries && npm run build
FROM build AS production-deps
RUN npm prune --omit=dev
FROM node:24.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates=20230311+deb12u1 && rm -rf /var/lib/apt/lists/*
ARG FLEET_REVISION=development
LABEL org.opencontainers.image.source="https://github.com/safa-safakhou/fleet" org.opencontainers.image.revision=$FLEET_REVISION
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY vendor ./vendor
COPY migrations ./migrations
COPY package.json ./
COPY scripts/state-proof.mjs ./scripts/state-proof.mjs
USER node
CMD ["node","dist/server/main.js"]
