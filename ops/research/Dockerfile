FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS build
WORKDIR /app
RUN npm install --global npm@12.2.1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts vitest.config.ts biome.json ./
COPY src ./src
COPY web ./web
COPY config ./config
COPY vendor ./vendor
COPY migrations ./migrations
COPY tests ./tests
COPY scripts ./scripts
RUN npm run build
FROM build AS production-deps
RUN npm prune --omit=dev
FROM build AS qualification
COPY --from=production-deps /app/node_modules /release/node_modules
COPY --from=build /app/dist /release/dist
COPY --from=build /app/config /release/config
COPY --from=build /app/vendor /release/vendor
COPY package.json /release/package.json
FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS inspection
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY config ./config
COPY vendor ./vendor
COPY package.json ./
USER 10001:10001
CMD ["node","dist/server/research/package.js"]
