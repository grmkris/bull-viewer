# syntax=docker/dockerfile:1.7

# ─── build stage ─────────────────────────────────────────────────────────
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun --filter @grmkris/bull-viewer-ui build

# ─── runtime stage ───────────────────────────────────────────────────────
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BULL_VIEWER_AUTH_MODE=none

# Copy only what the standalone runtime needs: source for the six workspace
# packages it imports (bun runs TS directly) + node_modules + UI dist.
COPY --from=build /app/node_modules            ./node_modules
COPY --from=build /app/package.json            ./package.json
COPY --from=build /app/packages/core/src       ./packages/core/src
COPY --from=build /app/packages/core/package.json   ./packages/core/package.json
COPY --from=build /app/packages/api/src        ./packages/api/src
COPY --from=build /app/packages/api/package.json    ./packages/api/package.json
COPY --from=build /app/packages/mcp/src        ./packages/mcp/src
COPY --from=build /app/packages/mcp/package.json    ./packages/mcp/package.json
COPY --from=build /app/packages/standalone/src ./packages/standalone/src
COPY --from=build /app/packages/standalone/package.json ./packages/standalone/package.json
COPY --from=build /app/packages/ui/dist        ./packages/ui/dist
COPY --from=build /app/packages/ui/package.json     ./packages/ui/package.json

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "packages/standalone/src/index.ts"]
