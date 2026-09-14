# Roamola -- apps/web, built from the pnpm monorepo root.
#
# Two stages: build the whole workspace with pnpm, then carry the built
# /app directory (node_modules included -- pnpm's workspace symlinks make a
# slim/pruned copy fragile, so this trades some image size for a build that
# just works) into a fresh runtime image. Revisit with `output: "standalone"`
# once the app has enough real dependencies for image size to matter.
#
# Coolify config this must match (Roamola / production / roamola-site):
#   Build strategy: Dockerfile, base directory "/", Dockerfile location "/Dockerfile"
#   Exposed port: 80 (traefik labels hardcode port 80 -- see below)

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @roamola/web build

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app /app

WORKDIR /app/apps/web
EXPOSE 80

# scripts/container-init.mjs applies pending Postgres migrations and makes
# sure the ClickHouse `event` table exists, then hands off to `next start`.
# Both steps are idempotent, so this runs on every container start, not
# just the first deploy -- see that file for why it's plain Node.
CMD ["sh", "-c", "node /app/scripts/container-init.mjs && pnpm exec next start -p 80"]
