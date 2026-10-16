# syntax=docker/dockerfile:1

FROM node:24.21.0-alpine3.24 AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# One image for the API + dashboard, the worker and the seed script; the command picks the role.
FROM base AS app
ENV NODE_ENV=production PORT=3500
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/web/dist ./web/dist
COPY --chown=app:app package.json ./
COPY --chown=app:app examples ./examples
USER app
EXPOSE 3500
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3500/api/health || exit 1
CMD ["node", "dist/server/index.js"]
