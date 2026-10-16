# Web Next.js. Contexto de build = raíz del monorepo.
# NEXT_PUBLIC_* se incorpora durante la compilación.
FROM node:20-bookworm AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SHOW_SOLUTIONS=false

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SHOW_SOLUTIONS=$NEXT_PUBLIC_SHOW_SOLUTIONS
ENV NEXT_TELEMETRY_DISABLED=1

# Manifiestos
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @secure-crm/shared --filter @secure-crm/web

# Código
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# Compilar y asignar permisos a Next.js
RUN pnpm --filter @secure-crm/shared build \
    && pnpm --filter @secure-crm/web build \
    && chown -R node:node apps/web/.next

# Ejecutar como usuario sin privilegios
USER node

# Iniciar Next.js directamente
WORKDIR /app/apps/web

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-p", "3000"]
