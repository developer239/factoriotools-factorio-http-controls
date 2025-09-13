#!/bin/bash
set -e

# Environment variables with defaults
HTTP_API_PORT=${PORT:-8080}
readonly HTTP_API_PORT

export FACTORIO_RCON_HOST=${FACTORIO_RCON_HOST:-localhost}
export FACTORIO_RCON_PORT=${FACTORIO_RCON_PORT:-27015}
export FACTORIO_RCON_PASSWORD=${FACTORIO_RCON_PASSWORD:-factorio}
export FACTORIO_SAVE_NAME=${FACTORIO_SAVE_NAME:-default}
export FACTORIO_SERVER_NAME=${FACTORIO_SERVER_NAME:-"My Factorio Server"}
export FACTORIO_SERVER_DESCRIPTION=${FACTORIO_SERVER_DESCRIPTION:-"Factorio server with HTTP controls"}
export FACTORIO_MAX_PLAYERS=${FACTORIO_MAX_PLAYERS:-10}
export FACTORIO_ADMIN_USERS=${FACTORIO_ADMIN_USERS:-"[]"}
export FACTORIO_AUTOSAVE_INTERVAL=${FACTORIO_AUTOSAVE_INTERVAL:-10}
export FACTORIO_AUTOSAVE_SLOTS=${FACTORIO_AUTOSAVE_SLOTS:-5}
export FACTORIO_PORT=34197

# Architecture detection
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    FACTORIO_EXEC="/bin/box64 /opt/factorio/bin/x64/factorio"
else
    FACTORIO_EXEC="/opt/factorio/bin/x64/factorio"
fi

echo "Starting Factorio server: $FACTORIO_SERVER_NAME"
echo "Game port: $FACTORIO_PORT, HTTP API: $HTTP_API_PORT, RCON: $FACTORIO_RCON_PORT"
echo "Autosave: ${FACTORIO_AUTOSAVE_INTERVAL}min intervals, ${FACTORIO_AUTOSAVE_SLOTS} slots"

# Initialize Factorio configuration
init_factorio_config() {
    mkdir -p /factorio /data/factorio/{saves,config,mods}

    # Create symlinks to persistent storage
    for dir in saves config mods; do
        [ -d "/factorio/$dir" ] && [ ! -L "/factorio/$dir" ] && rm -rf "/factorio/$dir"
        [ ! -L "/factorio/$dir" ] && ln -sf "/data/factorio/$dir" "/factorio/$dir"
    done

    # Server settings
    if [ ! -f /factorio/config/server-settings.json ]; then
        cp /opt/factorio/data/server-settings.example.json /factorio/config/server-settings.json
        jq --arg name "$FACTORIO_SERVER_NAME" \
           --arg desc "$FACTORIO_SERVER_DESCRIPTION" \
           --arg maxplayers "$FACTORIO_MAX_PLAYERS" \
           --arg autosave_interval "$FACTORIO_AUTOSAVE_INTERVAL" \
           --arg autosave_slots "$FACTORIO_AUTOSAVE_SLOTS" \
           '.visibility = {"public": false, "lan": false} |
            .require_user_verification = false |
            .game_password = "" |
            .name = $name |
            .description = $desc |
            .max_players = ($maxplayers | tonumber) |
            .autosave_interval = ($autosave_interval | tonumber) |
            .autosave_slots = ($autosave_slots | tonumber)' \
           /factorio/config/server-settings.json > /tmp/settings.json &&
           mv /tmp/settings.json /factorio/config/server-settings.json
    fi

    # Admin users
    echo "$FACTORIO_ADMIN_USERS" > /factorio/config/server-adminlist.json

    # Other config files
    [ ! -f /factorio/config/map-gen-settings.json ] && cp /opt/factorio/data/map-gen-settings.example.json /factorio/config/map-gen-settings.json
    [ ! -f /factorio/config/map-settings.json ] && cp /opt/factorio/data/map-settings.example.json /factorio/config/map-settings.json
    [ ! -f /factorio/config/rconpw ] && echo "$FACTORIO_RCON_PASSWORD" > /factorio/config/rconpw

    # Create save if needed
    if [ ! -f "/factorio/saves/${FACTORIO_SAVE_NAME}.zip" ]; then
        $FACTORIO_EXEC \
            --create "/factorio/saves/${FACTORIO_SAVE_NAME}.zip" \
            --map-gen-settings /factorio/config/map-gen-settings.json \
            --map-settings /factorio/config/map-settings.json
    fi
}

# Start Factorio server
start_factorio() {
    init_factorio_config

    export PORT=$FACTORIO_PORT RCON_PORT=$FACTORIO_RCON_PORT CONFIG=/factorio/config MODS=/factorio/mods

    $FACTORIO_EXEC \
        --port $FACTORIO_PORT \
        --server-settings /factorio/config/server-settings.json \
        --server-adminlist /factorio/config/server-adminlist.json \
        --rcon-port $FACTORIO_RCON_PORT \
        --rcon-password "$FACTORIO_RCON_PASSWORD" \
        --server-id /factorio/config/server-id.json \
        --mod-directory /factorio/mods \
        --start-server "$FACTORIO_SAVE_NAME" &

    FACTORIO_PID=$!
}

# Start HTTP RCON server
start_http_server() {
    cd /opt/rcon-server

    # Wait for RCON to be ready
    timeout=60
    while [ $timeout -gt 0 ] && ! nc -z $FACTORIO_RCON_HOST $FACTORIO_RCON_PORT; do
        sleep 2
        timeout=$((timeout - 2))
    done

    [ $timeout -le 0 ] && { echo "RCON timeout"; exit 1; }

    export PORT=$HTTP_API_PORT
    node dist/main.js &
    HTTP_PID=$!
}

# Cleanup handler
cleanup() {
    [ -n "$HTTP_PID" ] && kill $HTTP_PID 2>/dev/null || true
    if [ -n "$FACTORIO_PID" ]; then
        kill $FACTORIO_PID 2>/dev/null || true
        wait $FACTORIO_PID 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start services
start_factorio
sleep 5
start_http_server
wait
