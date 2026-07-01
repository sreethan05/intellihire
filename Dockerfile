# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies
RUN npm ci
RUN npm --prefix client ci
RUN npm --prefix server ci

# Copy source code
COPY . .

# Build frontend
RUN npm --prefix client run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built frontend (vite outputs to server/dist)
COPY --from=builder /app/server/dist ./dist

# Copy server package files and install production deps
COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev

# Copy server source and built assets
COPY --from=builder /app/server ./server

# Copy root package.json for scripts
COPY --from=builder /app/package.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 5000

CMD ["npm", "--prefix", "server", "run", "start"]
