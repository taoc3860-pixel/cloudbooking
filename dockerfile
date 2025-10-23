# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./server.js
COPY web ./web

ENV PORT=5055
EXPOSE 5055

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:5055/healthz || exit 1

CMD ["node", "server.js"]