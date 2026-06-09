# freekill-gateway — Node WSS↔asio bridge. Built from the pnpm monorepo.
# Build context = repo root; the workspace lives at freekill-web/.
#
#   docker compose build gateway
#
# We run directly from the built workspace (no `pnpm deploy` — it's fragile with
# workspace deps on pnpm 10). The image carries the full workspace node_modules,
# which is acceptable for a single-service gateway.

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo/freekill-web
COPY freekill-web/ ./
# Install all workspace deps, then build the gateway + its workspace deps.
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @freekill-web/shared build \
 && pnpm --filter @freekill-web/protocol build \
 && pnpm --filter @freekill-web/gateway build

# ---- runtime: prune dev deps, keep the built workspace ----
FROM node:22-slim AS runtime
RUN corepack enable
WORKDIR /repo/freekill-web
COPY --from=build /repo/freekill-web ./
# Drop devDependencies to slim the image (keeps workspace links intact).
RUN pnpm install --frozen-lockfile --prod --ignore-scripts || true
WORKDIR /repo/freekill-web/apps/gateway
EXPOSE 9528
# ASIO_HOST etc. from the environment (docker-compose).
CMD ["node", "dist/index.js"]
