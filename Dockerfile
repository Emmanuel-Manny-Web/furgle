# syntax=docker/dockerfile:1

# ---- Stage 1: build the user-facing app (Vite) ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: build the admin panel (CRA + craco, via Yarn) ----
FROM node:20-alpine AS admin-build
WORKDIR /app/admin
RUN npm install -g yarn
COPY admin/package.json admin/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY admin/ ./
RUN yarn build

# ---- Stage 3: runtime (Node server) ----
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# Backend source + production dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/

# Built frontends
COPY --from=client-build /app/client/dist ./client/dist
COPY --from=admin-build /app/admin/build ./admin/build

# Root static assets (favicon + logos) served by the server
COPY favicon.png evoque-nova-logo.png evoque-nova.jpg furgle-logo.png ./

# Writable uploads directory
RUN mkdir -p uploads

WORKDIR /app/server
EXPOSE 3000
CMD ["node", "server.js"]
