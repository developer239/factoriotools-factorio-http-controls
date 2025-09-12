#!/bin/bash
set -e

echo "Starting Factorio RCON HTTP Server Container..."

# Default environment variables
export FACTORIO_RCON_HOST=${FACTORIO_RCON_HOST:-localhost}
export FACTORIO_RCON_PORT=${FACTORIO_RCON_PORT:-27015}
export FACTORIO_RCON_PASSWORD=${FACTORIO_RCON_PASSWORD:-factorio}
export FACTORIO_SAVE_NAME=${FACTORIO_SAVE_NAME:-default}
export PORT=${PORT:-8080}

# Set Factorio game server port (separate from HTTP API port)
export FACTORIO_PORT=34197

echo "Configuration:"
echo "RCON Host: $FACTORIO_RCON_HOST"
echo "RCON Port: $FACTORIO_RCON_PORT"
echo "HTTP API Port: $PORT"
echo "Factorio Game Port: $FACTORIO_PORT"
echo "Save Name: $FACTORIO_SAVE_NAME"

# Function to start Factorio server
start_factorio() {
    echo "Starting Factorio server..."

    # Ensure save directory exists
    mkdir -p /factorio/saves
    mkdir -p /factorio/config
    mkdir -p /factorio/mods

    # Set PORT environment variable for Factorio game server
    export PORT=$FACTORIO_PORT

    # Start Factorio server with RCON enabled
    /docker-entrypoint.sh \
        --rcon-bind-address=0.0.0.0:$FACTORIO_RCON_PORT \
        --rcon-password="$FACTORIO_RCON_PASSWORD" \
        --server-settings=/factorio/config/server-settings.json \
        --start-server="$FACTORIO_SAVE_NAME" &

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

# Check if netcat is available for port checking
if ! command -v nc &> /dev/null; then
    echo "Installing netcat for port checking..."
    apt-get update && apt-get install -y netcat-openbsd
fi

# Start services
start_factorio
sleep 5  # Give Factorio a moment to initialize
start_http_server

# Wait for child processes
wait
