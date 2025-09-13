#!/bin/bash
set -e

echo "Starting Factorio RCON HTTP Server Container..."

# CRITICAL FIX: Save HTTP API port and never overwrite it
HTTP_API_PORT=${PORT:-8080}
readonly HTTP_API_PORT  # Make it read-only to prevent accidental overwrite

# Default environment variables for Factorio RCON
export FACTORIO_RCON_HOST=${FACTORIO_RCON_HOST:-localhost}
export FACTORIO_RCON_PORT=${FACTORIO_RCON_PORT:-27015}
export FACTORIO_RCON_PASSWORD=${FACTORIO_RCON_PASSWORD:-factorio}
export FACTORIO_SAVE_NAME=${FACTORIO_SAVE_NAME:-default}

# Server configuration environment variables
export FACTORIO_SERVER_NAME=${FACTORIO_SERVER_NAME:-"My Factorio Server"}
export FACTORIO_SERVER_DESCRIPTION=${FACTORIO_SERVER_DESCRIPTION:-"Factorio server with HTTP controls"}
export FACTORIO_MAX_PLAYERS=${FACTORIO_MAX_PLAYERS:-10}
export FACTORIO_ADMIN_USERS=${FACTORIO_ADMIN_USERS:-"[]"}

# Set Factorio game server port (separate from HTTP API port)
export FACTORIO_PORT=34197

# ARCHITECTURE DETECTION FIX
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    FACTORIO_EXEC="/bin/box64 /opt/factorio/bin/x64/factorio"
    echo "ARM64 detected - using box64 emulation"
else
    FACTORIO_EXEC="/opt/factorio/bin/x64/factorio"
    echo "x86_64 detected - using native execution"
fi

echo "Configuration:"
echo "RCON Host: $FACTORIO_RCON_HOST"
echo "RCON Port: $FACTORIO_RCON_PORT"
echo "HTTP API Port: $HTTP_API_PORT"  # Now correctly shows 8080
echo "Factorio Game Port: $FACTORIO_PORT"  # Shows 34197
echo "Save Name: $FACTORIO_SAVE_NAME"
echo "Server Name: $FACTORIO_SERVER_NAME"
echo "Server Description: $FACTORIO_SERVER_DESCRIPTION"
echo "Max Players: $FACTORIO_MAX_PLAYERS"
echo "Admin Users: $FACTORIO_ADMIN_USERS"
echo "Architecture: $ARCH"
echo "Factorio Executable: $FACTORIO_EXEC"

# Function to check and handle permissions
check_permissions() {
    echo "Checking data directory permissions..."

    # Check if we can write to the data directory
    if [ ! -w "/data/factorio" ]; then
        echo "❌ PERMISSION ERROR: Cannot write to /data/factorio"
        echo "📋 Container runs as user $(id -u):$(id -g) but directory is owned by:"
        ls -la /data/ | grep factorio || echo "Directory not found"
        echo ""
        echo "🔧 MANUAL FIX REQUIRED:"
        echo "Run this command on your GCP instance:"
        echo "  sudo chown -R 845:845 /mnt/stateful_partition/factorio"
        echo ""
        echo "🏗️  PERMANENT FIX:"
        echo "Add an initContainer to your container-spec.yaml to fix permissions automatically"
        echo ""
        exit 1
    fi

    # Try to create a test file to verify write permissions
    if ! touch /data/factorio/.permission_test 2>/dev/null; then
        echo "❌ PERMISSION ERROR: Cannot create files in /data/factorio"
        echo "Directory exists but is not writable by user $(id -u):$(id -g)"
        exit 1
    fi

    # Clean up test file
    rm -f /data/factorio/.permission_test
    echo "✅ Permissions OK - can write to /data/factorio"
}

# Function to initialize Factorio configuration
init_factorio_config() {
    echo "Initializing Factorio configuration files..."

    # Create base factorio directory structure in container filesystem
    mkdir -p /factorio

    # Check permissions before attempting to create directories
    check_permissions

    # Create required directories - now we know we have permissions
    echo "Creating data directories..."
    mkdir -p /data/factorio/{saves,config,mods}
    echo "✅ Data directories created successfully"

    # Remove any existing directories in container filesystem and create symlinks to persistent storage
    for dir in saves config mods; do
        if [ -d "/factorio/$dir" ] && [ ! -L "/factorio/$dir" ]; then
            echo "Removing existing /factorio/$dir directory"
            rm -rf "/factorio/$dir"
        fi

        if [ ! -L "/factorio/$dir" ]; then
            echo "Creating symlink: /factorio/$dir -> /data/factorio/$dir"
            ln -sf "/data/factorio/$dir" "/factorio/$dir"
        fi
    done

    # Initialize configuration files if they don't exist (following base image logic)
    if [[ ! -f /factorio/config/server-settings.json ]]; then
        cp /opt/factorio/data/server-settings.example.json /factorio/config/server-settings.json
        echo "Created server-settings.json"

        # Configure server for IP-based connections (not public game finder)
        echo "Configuring server for IP-based connections..."

        # Use jq to modify server settings for IP-only access
        tmp_file=$(mktemp)
        jq --arg name "$FACTORIO_SERVER_NAME" \
           --arg desc "$FACTORIO_SERVER_DESCRIPTION" \
           --arg maxplayers "$FACTORIO_MAX_PLAYERS" \
           '.visibility = {"public": false, "lan": false} |
            .require_user_verification = false |
            .game_password = "" |
            .name = $name |
            .description = $desc |
            .max_players = ($maxplayers | tonumber)' \
           /factorio/config/server-settings.json > "$tmp_file" && \
           mv "$tmp_file" /factorio/config/server-settings.json

        echo "Server configured for IP-based connections (hidden from public listing)"
    fi

    # Create/update admin list configuration
    echo "Configuring admin users..."
    echo "$FACTORIO_ADMIN_USERS" > /factorio/config/server-adminlist.json
    echo "Admin list configured with: $FACTORIO_ADMIN_USERS"

    if [[ ! -f /factorio/config/map-gen-settings.json ]]; then
        cp /opt/factorio/data/map-gen-settings.example.json /factorio/config/map-gen-settings.json
    fi

    if [[ ! -f /factorio/config/map-settings.json ]]; then
        cp /opt/factorio/data/map-settings.example.json /factorio/config/map-settings.json
    fi

    # Create RCON password file if it doesn't exist
    if [[ ! -f /factorio/config/rconpw ]]; then
        echo "$FACTORIO_RCON_PASSWORD" > /factorio/config/rconpw
    fi

    # Create a new save file if it doesn't exist
    if [[ ! -f "/factorio/saves/${FACTORIO_SAVE_NAME}.zip" ]]; then
        echo "Creating new save file: ${FACTORIO_SAVE_NAME}.zip"
        # FIXED: Use architecture-aware executable
        $FACTORIO_EXEC \
            --create "/factorio/saves/${FACTORIO_SAVE_NAME}.zip" \
            --map-gen-settings /factorio/config/map-gen-settings.json \
            --map-settings /factorio/config/map-settings.json
        echo "Save file created successfully"
    fi
}

# Function to start Factorio server using base image's method
start_factorio() {
    echo "Starting Factorio server..."

    # Initialize configuration first
    init_factorio_config

    # Set environment variables for base image compatibility
    # IMPORTANT: Use FACTORIO_PORT, not PORT for Factorio game server
    export PORT=$FACTORIO_PORT  # Temporarily set for base image compatibility
    export RCON_PORT=$FACTORIO_RCON_PORT
    export CONFIG=/factorio/config
    export MODS=/factorio/mods

    # FIXED: Use architecture-aware execution
    $FACTORIO_EXEC \
        --port $FACTORIO_PORT \
        --server-settings /factorio/config/server-settings.json \
        --rcon-port $FACTORIO_RCON_PORT \
        --rcon-password "$FACTORIO_RCON_PASSWORD" \
        --server-id /factorio/config/server-id.json \
        --mod-directory /factorio/mods \
        --start-server "$FACTORIO_SAVE_NAME" &

    FACTORIO_PID=$!
    echo "Factorio server started with PID: $FACTORIO_PID"
}

# Function to start HTTP RCON server
start_http_server() {
    echo "Starting HTTP RCON server..."

    # Change to the RCON server directory
    cd /opt/rcon-server

    # Wait for Factorio to be ready (RCON port to be available)
    echo "Waiting for Factorio RCON to be ready..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if nc -z $FACTORIO_RCON_HOST $FACTORIO_RCON_PORT; then
            echo "Factorio RCON is ready!"
            break
        fi
        echo "Waiting for RCON... ($timeout seconds remaining)"
        sleep 2
        timeout=$((timeout - 2))
    done

    if [ $timeout -le 0 ]; then
        echo "Timeout waiting for Factorio RCON to be ready"
        exit 1
    fi

    # CRITICAL FIX: Use HTTP_API_PORT for HTTP server
    export PORT=$HTTP_API_PORT
    echo "Starting HTTP server on port $PORT"

    # Start the HTTP server
    node dist/main.js &
    HTTP_PID=$!
    echo "HTTP RCON server started with PID: $HTTP_PID"
}

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."

    if [ ! -z "$HTTP_PID" ]; then
        echo "Stopping HTTP server..."
        kill $HTTP_PID 2>/dev/null || true
    fi

    if [ ! -z "$FACTORIO_PID" ]; then
        echo "Stopping Factorio server..."
        kill $FACTORIO_PID 2>/dev/null || true
        wait $FACTORIO_PID 2>/dev/null || true
    fi

    echo "Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start services
start_factorio
sleep 5  # Give Factorio a moment to initialize
start_http_server

# Wait for child processes
wait
