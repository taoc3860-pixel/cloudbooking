FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
ENV PORT=5055
EXPOSE 5055

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/healthz || exit 1

CMD ["node", "server.js"]
