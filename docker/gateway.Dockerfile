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

# ---- runtime: run from the built workspace ----
# (We keep the full workspace node_modules rather than pruning — pnpm 10's --prod
# prune wants a TTY/CI flag and the gateway is a single small service, so the size
# saving isn't worth the fragility.)
FROM node:22-slim AS runtime
WORKDIR /repo/freekill-web
COPY --from=build /repo/freekill-web ./
WORKDIR /repo/freekill-web/apps/gateway
EXPOSE 9528
# ASIO_HOST etc. from the environment (docker-compose).
CMD ["node", "dist/index.js"]
