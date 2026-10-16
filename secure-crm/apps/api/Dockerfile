# API Express + better-sqlite3. Contexto de build = raíz del monorepo.
FROM node:20-bookworm AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

# Manifiestos primero (mejor caché)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @secure-crm/shared --filter @secure-crm/api

# Código
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Compilar y preparar el directorio de datos
RUN pnpm --filter @secure-crm/shared build \
    && pnpm --filter @secure-crm/api build \
    && mkdir -p apps/api/data \
    && chown -R node:node apps/api/data

# Ejecutar como usuario sin privilegios
USER node

EXPOSE 4000

# Crear y poblar la BD si no existe; luego iniciar el servidor
CMD ["sh", "-c", "node apps/api/dist/seed.js && node apps/api/dist/index.js"]
