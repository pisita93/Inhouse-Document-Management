# --- Stage 1: build client ---
FROM node:20-alpine AS client-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.base.json tsconfig.client.json vite.config.ts ./
COPY shared ./shared
COPY client ./client
RUN npm run build:client

# --- Stage 2: build server ---
FROM node:20-alpine AS server-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.base.json tsconfig.server.json ./
COPY shared ./shared
COPY server ./server
RUN npm run build:server

# --- Stage 3: runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/shared ./shared
COPY --from=client-build /app/client/dist ./client/dist
EXPOSE 5900
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:5900/api/health || exit 1
CMD ["node", "server/dist/server/src/index.js"]
