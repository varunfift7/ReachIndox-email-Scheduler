# Multi-stage Dockerfile for the ReachInbox frontend (Vite + React)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY vite.config.ts index.html ./
COPY src ./src
COPY tsconfig*.json ./

RUN npm run build

# Production stage: serve static files with nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
