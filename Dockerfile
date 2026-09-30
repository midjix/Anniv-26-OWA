# syntax=docker/dockerfile:1
# ---------------------------------------------------------------
# Pit Crush — image de production (Node 22 Alpine, non-root)
# ---------------------------------------------------------------

# 1) Dépendances (une seule : qrcode-generator, sans sous-dépendance)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# 2) Photos des activités, téléchargées au build (le conteneur final n'a pas besoin d'internet)
FROM alpine:3.20 AS photos
RUN apk add --no-cache curl
COPY scripts/photos.txt scripts/fetch-photos.sh /tmp/
RUN sh /tmp/fetch-photos.sh /tmp/photos.txt /media

# 3) Image finale
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    MEDIA_DIRS=/app/photos:/app/media \
    TRUST_PROXY=1
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public
COPY photos ./photos
COPY --from=photos /media ./media
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/index.js"]
