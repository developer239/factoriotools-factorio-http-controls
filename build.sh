#!/bin/bash
# Build script for Factorio HTTP Controls with configurable version

VERSION=${1:-2.0.55}

echo "Building Factorio HTTP Controls with Factorio version: $VERSION"

docker build --build-arg FACTORIO_VERSION=$VERSION -t factorio-with-http-controls .

echo "Build complete! Image tagged as: factorio-with-http-controls"
echo "Run with: docker run -d --name factorio-server --env-file .env -p 34197:34197/udp -p 8080:8080 -v factorio-saves:/factorio/saves factorio-with-http-controls"
