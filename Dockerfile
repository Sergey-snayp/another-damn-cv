# One image for the whole app: the API, the built web app it serves, Chromium
# for CV PDFs, and the Claude CLI for the AI (signed in with
# CLAUDE_CODE_OAUTH_TOKEN, made with `claude setup-token`).

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY backend/package.json backend/package-lock.json backend/
COPY backend/prisma backend/prisma
RUN cd backend && npm ci
COPY frontend frontend
# The web app's build writes the extension's copy of the colors.
COPY extension extension
RUN cd frontend && npm run build
COPY backend backend
RUN cd backend && npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@2.1.259 && npm cache clean --force
ENV NODE_ENV=production \
  CHROME_PATH=/usr/bin/chromium \
  CHROME_NO_SANDBOX=1 \
  STATIC_DIR=/app/frontend/dist \
  CLAUDE_BIN=claude
WORKDIR /app/backend
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules node_modules
COPY --from=build /app/backend/prisma prisma
COPY --from=build /app/backend/dist dist
COPY --from=build /app/frontend/dist /app/frontend/dist
USER node
# Migrations first (only those not applied yet), then the server. Its own Chrome
# prints CVs from this process, on localhost.
CMD ["sh", "-c", "npx prisma migrate deploy && export PRINT_URL=${PRINT_URL:-http://127.0.0.1:${PORT:-3001}} && exec node --enable-source-maps dist/main"]
