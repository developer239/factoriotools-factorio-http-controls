# Multi-stage build for NestJS RCON Server + Factorio
# Stage 1: Build the NestJS application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Stage 2: Create final image extending Factorio
FROM factoriotools/factorio:stable

# Install Node.js in the Factorio container
USER root

# Install Node.js 18
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create directory for the RCON server
WORKDIR /opt/rcon-server

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create startup script that runs both Factorio and RCON server
COPY --chown=factorio:factorio startup.sh /opt/rcon-server/
RUN chmod +x /opt/rcon-server/startup.sh

# Switch back to factorio user
USER factorio

# Expose ports
# 34197/udp: Factorio game port  
# 27015/tcp: Factorio RCON port (internal only)
# 8080/tcp: HTTP API port
EXPOSE 34197/udp 27015/tcp 8080/tcp

# Use custom startup script
CMD ["/opt/rcon-server/startup.sh"]
