# caddy — the single public-facing server: HTTPS (auto-cert for your domain),
# serves the built web static files, and reverse-proxies /ws → gateway:9528.
# Build context = repo root (it builds the web app from the monorepo + sibling
# asset repos, same as web.Dockerfile, then serves the output).
#
#   docker compose build caddy

# ---- web build stage (same as web.Dockerfile) ----
FROM node:22-slim AS web
RUN corepack enable
WORKDIR /repo
COPY FreeKill-release/ ./FreeKill-release/
COPY FreeKill-sourcecode/ ./FreeKill-sourcecode/
COPY freekill-web/ ./freekill-web/
WORKDIR /repo/freekill-web
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @freekill-web/shared build \
 && pnpm --filter @freekill-web/protocol build \
 && pnpm --filter @freekill-web/lua-native build \
 && pnpm --filter @freekill-web/assets build \
 && pnpm --filter @freekill-web/web sync-assets \
 && node packages/assets/scripts/verify-fk-assets.mjs apps/web/public/fk \
 && pnpm --filter @freekill-web/web build

# ---- caddy runtime ----
FROM caddy:2-alpine
COPY --from=web /repo/freekill-web/apps/web/dist /srv
COPY freekill-web/docker/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
