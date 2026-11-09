# Reins production image: build the Nitro output, then run it bare.
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/.output ./.output
# A few server chunks keep a small runtime-dep set external (CJS require()
# at SSR time: `react` via the inlined use-sync-external-store shim, and
# `ajv`/`ajv-formats` via better-auth). Install them beside the server entry
# pin-release to the pnpm-lock versions so SSR and the client bundle agree.
RUN cd .output/server && npm install --omit=dev --no-package-lock --no-audit \
    --no-fund --loglevel=error --silent \
    react@19.3.1 react-dom@19.3.1 ajv@8.20.0 ajv-formats@3.0.1
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
