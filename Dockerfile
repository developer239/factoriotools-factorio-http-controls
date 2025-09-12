# Multi-stage build for NestJS RCON Server + Factorio
# Stage 1: Build the NestJS application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY yarn.lock ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install dependencies using yarn
RUN yarn install --frozen-lockfile --production=false

# Copy source code
COPY src/ ./src/

# Build the application
RUN yarn build

# Stage 2: Create final image extending Factorio
FROM factoriotools/factorio:stable

# Install Node.js in the Factorio container
USER root

# Install Node.js 20 and Yarn
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g yarn && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create directory for the RCON server
WORKDIR /opt/rcon-server

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create startup script that runs both Factorio and RCON server
COPY startup.sh /opt/rcon-server/startup.sh
RUN chmod +x /opt/rcon-server/startup.sh

# Ensure factorio user owns the factorio directories and fix permissions
RUN mkdir -p /factorio/saves /factorio/config /factorio/mods && \
    chown -R factorio:factorio /factorio && \
    chmod -R 755 /factorio && \
    chown -R factorio:factorio /opt/rcon-server

# Switch back to factorio user
USER factorio

# Expose ports
# 34197/udp: Factorio game port
# 27015/tcp: Factorio RCON port (internal only)
# 8080/tcp: HTTP API port
EXPOSE 34197/udp 27015/tcp 8080/tcp

# Use custom startup script
CMD ["/opt/rcon-server/startup.sh"]
