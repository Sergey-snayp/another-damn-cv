FROM node:20-bookworm-slim AS base

# better-sqlite3 compiles natively when no prebuild matches the platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl python3 make g++ \
      # tectonic's runtime deps
      libfontconfig1 libgraphite2-3 libharfbuzz0b libicu72 libssl3 \
      fonts-texgyre \
    && rm -rf /var/lib/apt/lists/*

# Static tectonic binary — ~20MB, versus ~5GB for a full TeX Live install.
ARG TECTONIC_VERSION=0.15.0
RUN ARCH="$(uname -m)" && \
    case "$ARCH" in \
      x86_64)  T=x86_64-unknown-linux-musl ;; \
      aarch64) T=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported arch $ARCH" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${T}.tar.gz" \
      | tar -xz -C /usr/local/bin tectonic && \
    tectonic --version

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY profile ./profile

ENV NODE_ENV=production \
    DB_PATH=/app/data/jobs.db \
    OUT_DIR=/app/out \
    TZ=America/Vancouver

VOLUME ["/app/data", "/app/out"]
CMD ["npx", "tsx", "src/bot/index.ts"]
