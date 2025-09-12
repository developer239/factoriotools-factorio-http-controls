#!/bin/bash
set -e

echo "Starting Factorio RCON HTTP Server Container..."

# Save the HTTP API port before any potential overwrites
HTTP_API_PORT=${PORT:-8080}

# Default environment variables for Factorio RCON
export FACTORIO_RCON_HOST=${FACTORIO_RCON_HOST:-localhost}
export FACTORIO_RCON_PORT=${FACTORIO_RCON_PORT:-27015}
export FACTORIO_RCON_PASSWORD=${FACTORIO_RCON_PASSWORD:-factorio}
export FACTORIO_SAVE_NAME=${FACTORIO_SAVE_NAME:-default}

# Set Factorio game server port (separate from HTTP API port)
export FACTORIO_PORT=34197

echo "Configuration:"
echo "RCON Host: $FACTORIO_RCON_HOST"
echo "RCON Port: $FACTORIO_RCON_PORT"
echo "HTTP API Port: $HTTP_API_PORT"
echo "Factorio Game Port: $FACTORIO_PORT"
echo "Save Name: $FACTORIO_SAVE_NAME"

# Function to initialize Factorio configuration
init_factorio_config() {
    echo "Initializing Factorio configuration files..."

    # Ensure directories exist
    mkdir -p /factorio/saves
    mkdir -p /factorio/config
    mkdir -p /factorio/mods

    # Initialize configuration files if they don't exist (following base image logic)
    if [[ ! -f /factorio/config/server-settings.json ]]; then
        cp /opt/factorio/data/server-settings.example.json /factorio/config/server-settings.json
        echo "Created server-settings.json"

        # Configure server for IP-based connections (not public game finder)
        echo "Configuring server for IP-based connections..."

        # Use jq to modify server settings for IP-only access
        tmp_file=$(mktemp)
        jq --arg name "${FACTORIO_SERVER_NAME:-My Factorio Server}" \
           --arg desc "${FACTORIO_SERVER_DESCRIPTION:-Factorio server with HTTP controls}" \
           '.visibility = {"public": false, "lan": true} |
            .require_user_verification = false |
            .game_password = "" |
            .name = $name |
            .description = $desc' \
           /factorio/config/server-settings.json > "$tmp_file" && \
           mv "$tmp_file" /factorio/config/server-settings.json

        echo "Server configured for IP-based connections (hidden from public listing)"
    fi

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
        /bin/box64 /opt/factorio/bin/x64/factorio \
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
    export PORT=$FACTORIO_PORT
    export RCON_PORT=$FACTORIO_RCON_PORT
    export CONFIG=/factorio/config
    export MODS=/factorio/mods

    # Use base image's factorio execution method with proper emulation
    /bin/box64 /opt/factorio/bin/x64/factorio \
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

    # Restore PORT for HTTP API
    export PORT=$HTTP_API_PORT

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
