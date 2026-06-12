# freekill-gateway — Node WSS↔asio bridge. Built from the pnpm monorepo.
# Build context = repo root; the workspace lives at freekill-web/.
#
#   docker compose build gateway
#
# We run directly from the built workspace (no `pnpm deploy` — it's fragile with
# workspace deps on pnpm 10). The image carries the full workspace node_modules,
# which is acceptable for a single-service gateway.
#
# IMPORTANT (layer hygiene): the gateway depends ONLY on @freekill-web/shared +
# @freekill-web/protocol (apps/gateway/package.json). It does NOT need apps/web. We
# therefore COPY only the manifests (so `pnpm install --frozen-lockfile` can validate
# the workspace) + the SOURCE of the packages the gateway actually builds — and never
# apps/web's source. This way a pure front-end change (apps/web/src/...) does NOT
# invalidate any gateway image layer, so `docker compose up -d` won't recreate the
# gateway container — which would otherwise drop every browser's WebSocket and kick
# in-game players out (the gateway holds each browser's asio TCP + its in-memory
# reconnect grace window). Only caddy (the web bundle) rebuilds on a front-end change.

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo/freekill-web

# 1) Workspace manifests only — the layer that gates `pnpm install`. pnpm needs every
#    workspace member's package.json present (workspace globs apps/*, packages/*) to
#    resolve the frozen lockfile, but NOT their source. Listing each package.json
#    explicitly means editing apps/web SOURCE never busts this layer; only a
#    dependency change (some package.json / the lockfile) does.
COPY freekill-web/package.json freekill-web/pnpm-lock.yaml freekill-web/pnpm-workspace.yaml freekill-web/.npmrc freekill-web/tsconfig.base.json ./
COPY freekill-web/apps/gateway/package.json ./apps/gateway/
COPY freekill-web/apps/web/package.json ./apps/web/
COPY freekill-web/packages/shared/package.json ./packages/shared/
COPY freekill-web/packages/protocol/package.json ./packages/protocol/
COPY freekill-web/packages/lua-native/package.json ./packages/lua-native/
COPY freekill-web/packages/assets/package.json ./packages/assets/
RUN pnpm install --frozen-lockfile

# 2) Source for ONLY what the gateway builds (shared → protocol → gateway). apps/web
#    source is deliberately NOT copied, so front-end edits don't rebuild the gateway.
COPY freekill-web/packages/shared/ ./packages/shared/
COPY freekill-web/packages/protocol/ ./packages/protocol/
COPY freekill-web/apps/gateway/ ./apps/gateway/
RUN pnpm --filter @freekill-web/shared build \
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
