# Multi-stage: build deps rieng, image runtime nho + chay non-root (bao mat co ban)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# APP_VERSION duoc CI truyen vao (--build-arg) de app biet no thuoc build nao
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
COPY --from=deps /app/node_modules ./node_modules
COPY server.js ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
