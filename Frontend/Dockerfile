# Multi-stage Docker build for Nitro Rush Phaser 3 Frontend
# Stage 1: Build static assets with Node.js 20 & Vite
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Accept optional production WebSocket URL at build time
ARG VITE_WS_URL=""
ENV VITE_WS_URL=${VITE_WS_URL}

RUN npm run build

# Stage 2: High-performance Nginx Alpine web server
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY ./deploy/nginx-frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

