# Factorio HTTP Controls

All-in-one Docker container with Factorio 1.1.110 server and NestJS HTTP API for RCON management. Provides REST
endpoints for server control, command execution, and game management.

## Setup

### 1. Build Docker Image

Build the Docker image locally:

```bash
docker build -t factorio-http-controls .
```

### 2. Environment Configuration

Copy the example environment file and customize:

```bash
cp .env.example .env
```

### 3. Run the Container

Run the all-in-one container (includes both Factorio server and HTTP API):

```bash
docker run -d \
  --name factorio-server \
  --env-file .env \
  -p 34197:34197/udp \
  -p 8080:8080 \
  -v factorio-saves:/factorio/saves \
  factorio-http-controls
```

The container automatically:

- Starts Factorio server 1.1.110 with RCON enabled
- Generates `server-settings.json` with proper RCON configuration
- Starts the HTTP API server
- Coordinates both services

## Server Management

The container runs both services automatically. No manual Factorio server setup required.

## API Usage

### Available Endpoints

**Get Server Time:**

```bash
curl http://localhost:8080/factorio/time
```

### Save File Management

**Access saves volume:**

```bash
# List save files
docker exec factorio-server ls -la /factorio/saves/

# Copy save file out
docker cp factorio-server:/factorio/saves/default.zip ./backup.zip

# Copy save file in
docker cp ./my-save.zip factorio-server:/factorio/saves/
```
