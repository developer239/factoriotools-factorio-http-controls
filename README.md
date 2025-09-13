# Factorio With HTTP Controls

Docker container with Factorio server and NestJS HTTP API for RCON management.

## Setup

### 1. Build Docker Image

Build the Docker image with default Factorio version (2.0.55):

```bash
docker build --platform linux/amd64 -t jarnotmichal/factorio-with-http-controls:2.0.55-3 .
```

**Build with specific Factorio version:**

```bash
# Build with Factorio 1.1.110
docker build --platform linux/amd64 --build-arg FACTORIO_VERSION=1.1.110 -t jarnotmichal/factorio-with-http-controls:1.1.110-3 .

# Build with Factorio 1.1.109
docker build --platform linux/amd64 --build-arg FACTORIO_VERSION=1.1.109 -t jarnotmichal/factorio-with-http-controls:1.1.109-3 .
```

**Note:** The `--platform linux/amd64` flag ensures the image is built for x86_64 architecture, making it compatible with most cloud platforms (GCP, AWS, Azure) even when building on Apple Silicon Macs.

**Note:** Check [factoriotools/factorio](https://hub.docker.com/r/factoriotools/factorio/tags) for all available versions.

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
  -v factorio-saves:/data/factorio \
  jarnotmichal/factorio-with-http-controls:2.0.55-3
```

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

**Get Server Status (Player List):**

```bash
curl http://localhost:8080/factorio/status
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

**Pause Game:**

```bash
curl -X POST http://localhost:8080/factorio/pause
```

**Unpause Game:**

```bash
curl -X POST http://localhost:8080/factorio/unpause
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

## Docker Hub Deployment

### Publishing to Docker Hub

The `--platform linux/amd64` flag ensures your images work on x86_64 cloud servers (GCP, AWS, Azure) regardless of your build machine architecture.

**1. Build and Tag for Docker Hub:**

```bash
# Build with specific Factorio version
docker build --platform linux/amd64 --build-arg FACTORIO_VERSION=2.0.55 -t jarnotmichal/factorio-with-http-controls:2.0.55-3 .

# Build latest tag (uses default version 2.0.55)
docker build --platform linux/amd64 -t jarnotmichal/factorio-with-http-controls:latest .
```

**2. Push to Docker Hub:**

```bash
# Push latest tag
docker push jarnotmichal/factorio-with-http-controls:latest

# Push specific version
docker push jarnotmichal/factorio-with-http-controls:2.0.55-3
```

**3. Once published, others can use your image directly:**

```bash
# Pull and run from Docker Hub (from project directory with .env file)
docker run -d \
  --name factorio-server \
  --env-file .env \
  -p 34197:34197/udp \
  -p 8080:8080 \
  -v factorio-saves:/data/factorio \
  jarnotmichal/factorio-with-http-controls:2.0.55-3
```
