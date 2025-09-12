# Factorio With HTTP Controls

All-in-one Docker container with Factorio server and NestJS HTTP API for RCON management. Provides REST
endpoints for minimal server control.

## Setup

### 1. Build Docker Image

Build the Docker image with default Factorio version (1.1.110):

```bash
docker build -t factorio-with-http-controls .
```

**Build with specific Factorio version:**

```bash
# Build with Factorio 2.0.55
docker build --build-arg FACTORIO_VERSION=2.0.55 -t factorio-with-http-controls .

# Build with Factorio 1.1.109
docker build --build-arg FACTORIO_VERSION=1.1.109 -t factorio-with-http-controls .
```

**Note:** Check [factoriotools/factorio](https://hub.docker.com/r/factoriotools/factorio/tags) for all available versions.

**Quick Build Script (Optional):**

```bash
# Make executable and use
chmod +x build.sh

# Build with default version (1.1.110)
./build.sh

# Build with specific version
./build.sh 2.0.55
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
  factorio-with-http-controls
```

The container automatically:

- Starts Factorio server with RCON enabled
- Generates `server-settings.json` with proper RCON configuration
- Configures server for IP-based connections (hidden from public browser)
- Starts the HTTP API server

## Connecting to the Server

**Direct IP Connection:**

1. In Factorio, go to "Play" → "Multiplayer"
2. Click "Connect to address"
3. Enter your server's IP address and port: `your-server-ip:34197` for example `127.0.0.1:34197`
4. The server will not appear in the public server browser

**Server Configuration:**

- Game Port: `34197/udp` (for Factorio client connections)
- HTTP API Port: `8080/tcp` (for RCON management)
- RCON Port: `27015/tcp` (internal only)

## Server Management

The container runs both services automatically. No manual Factorio server setup required.

## API Usage

### Available Endpoints

**Get Server Time:**

```bash
curl http://localhost:8080/factorio/time
```

**Slow Down Time:**

```bash
curl -X POST http://localhost:8080/factorio/speed/slow
```

**Set Normal Speed:**

```bash
curl -X POST http://localhost:8080/factorio/speed/normal
```

**Speed Up Time:**

```bash
curl -X POST http://localhost:8080/factorio/speed/fast
```

**Trigger Save:**

```bash
curl -X POST http://localhost:8080/factorio/save
```

**List Save Files:**

```bash
curl http://localhost:8080/factorio/saves
```

**Load Specific Save:**

```bash
curl -X POST http://localhost:8080/factorio/load/default
curl -X POST http://localhost:8080/factorio/load/_autosave4
```

**Load Local Save File:**

```bash
curl -X POST http://localhost:8080/factorio/upload-save \
  -F "saveFile=@/Users/michaljarnot/Library/Application Support/factorio/saves/example-to-load-on-server.zip" \
  -F "autoLoad=true"
```
