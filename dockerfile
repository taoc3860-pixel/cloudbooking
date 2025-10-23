FROM node:20-alpine
# Create app directory
WORKDIR /app
# Install deps first
COPY package*.json ./
RUN npm ci --omit=dev
# Copy source
COPY . .

# Ensure data dir exists (for file persistence)
RUN mkdir -p /app/data \
  && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app

USER app

ENV NODE_ENV=production \
    PORT=5055

EXPOSE 5055

# Start
CMD ["node", "server.js"]