# Docker Usage Guide

This document provides comprehensive instructions for running the Autotask MCP Server using Docker.

## Quick Start

### Pull from GitHub Container Registry

```bash
docker pull ghcr.io/wyre-ai/autotask-mcp:latest
```

### Run with Environment Variables

```bash
docker run -d \
  --name autotask-mcp \
  -e AUTOTASK_USERNAME="your-api-user@company.com" \
  -e AUTOTASK_SECRET="your-secret-key" \
  -e AUTOTASK_INTEGRATION_CODE="your-integration-code" \
  -e LOG_LEVEL="info" \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

### Run with Environment File

Create a `.env` file:
```bash
AUTOTASK_USERNAME=your-api-user@company.com
AUTOTASK_SECRET=your-secret-key
AUTOTASK_INTEGRATION_CODE=your-integration-code
LOG_LEVEL=info
LOG_FORMAT=json
```

Run with env file:
```bash
docker run -d \
  --name autotask-mcp \
  --env-file .env \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

## Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  autotask-mcp:
    image: ghcr.io/wyre-ai/autotask-mcp:latest
    container_name: autotask-mcp
    restart: unless-stopped
    environment:
      - AUTOTASK_USERNAME=${AUTOTASK_USERNAME}
      - AUTOTASK_SECRET=${AUTOTASK_SECRET}
      - AUTOTASK_INTEGRATION_CODE=${AUTOTASK_INTEGRATION_CODE}
      - LOG_LEVEL=info
      - LOG_FORMAT=json
      - NODE_ENV=production
    volumes:
      - autotask-logs:/app/logs
    healthcheck:
      test: ["CMD", "node", "-e", "console.log('Health check passed')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  autotask-logs:
    driver: local
```

Run with Docker Compose:
```bash
docker-compose up -d
```

## Building from Source

### Build Locally

```bash
# Clone the repository
git clone https://github.com/WYRE-AI/autotask-mcp.git
cd autotask-mcp

# Build the Docker image
docker build -t autotask-mcp:local .
```

### Build with Custom Tags

```bash
# Build with version tag
docker build -t autotask-mcp:v1.0.1 .

# Build with build arguments
docker build \
  --build-arg VERSION=1.0.1 \
  --build-arg COMMIT_SHA=$(git rev-parse HEAD) \
  --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t autotask-mcp:custom .
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTOTASK_USERNAME` | Autotask API username | `user@company.com` |
| `AUTOTASK_SECRET` | Autotask API secret key | `your-secret-key` |
| `AUTOTASK_INTEGRATION_CODE` | Autotask integration code | `your-integration-code` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `json` | Log format: `json`, `simple` |
| `NODE_ENV` | `production` | Node.js environment |
| `AUTOTASK_TIMEOUT` | `30000` | API timeout in milliseconds |
| `AUTOTASK_RETRY_ATTEMPTS` | `3` | Number of retry attempts |

## Using with MCP Clients

### Claude Desktop Configuration (stdio via Docker)

The Docker image defaults to HTTP transport. For Claude Desktop (which uses stdio), you must override the transport and entrypoint:

```json
{
  "mcpServers": {
    "autotask": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "MCP_TRANSPORT=stdio",
        "--env-file", "/path/to/your/.env",
        "--entrypoint", "node",
        "ghcr.io/wyre-ai/autotask-mcp:latest",
        "dist/entry.js"
      ]
    }
  }
}
```

Or with inline credentials:

```json
{
  "mcpServers": {
    "autotask": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "MCP_TRANSPORT=stdio",
        "-e", "AUTOTASK_USERNAME=your-user@company.com",
        "-e", "AUTOTASK_SECRET=your-secret",
        "-e", "AUTOTASK_INTEGRATION_CODE=your-code",
        "--entrypoint", "node",
        "ghcr.io/wyre-ai/autotask-mcp:latest",
        "dist/entry.js"
      ]
    }
  }
}
```

**Why `--entrypoint node` and `dist/entry.js`?** The default CMD runs `dist/index.js` in HTTP mode. For stdio, `entry.js` provides the stdout guard that prevents library output from corrupting the MCP JSON-RPC channel.

### Using Named Container (HTTP transport)

For a persistent HTTP-based MCP server:

```bash
# Start the container (HTTP transport, default)
docker run -d \
  --name autotask-mcp-server \
  -p 8080:8080 \
  --env-file .env \
  ghcr.io/wyre-ai/autotask-mcp:latest

# Verify health
curl http://localhost:8080/health
```

## Container Management

### View Logs

```bash
# View all logs
docker logs autotask-mcp

# Follow logs in real-time
docker logs -f autotask-mcp

# View last 100 lines
docker logs --tail 100 autotask-mcp
```

### Health Checks

```bash
# Check container health
docker inspect autotask-mcp | grep -A 10 '"Health"'

# Manual health check
docker exec autotask-mcp node -e "console.log('Health check passed')"
```

### Resource Monitoring

```bash
# Monitor resource usage
docker stats autotask-mcp

# View container details
docker inspect autotask-mcp
```

## Troubleshooting

### Common Issues

#### Container Exits Immediately
```bash
# Check logs for errors
docker logs autotask-mcp

# Common causes:
# - Missing required environment variables
# - Invalid Autotask credentials
# - Network connectivity issues
```

#### Permission Errors
```bash
# Ensure proper file permissions
chmod 644 .env

# Check if user has Docker permissions
sudo usermod -aG docker $USER
```

#### Memory Issues
```bash
# Run with memory limits
docker run -d \
  --name autotask-mcp \
  --memory=512m \
  --env-file .env \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

### Debug Mode

Run container in debug mode:

```bash
docker run -it --rm \
  --env-file .env \
  -e LOG_LEVEL=debug \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

### Interactive Debugging

```bash
# Start container with shell
docker run -it --rm \
  --env-file .env \
  --entrypoint /bin/sh \
  ghcr.io/wyre-ai/autotask-mcp:latest

# Inside container, run manually
node dist/index.js
```

## Security Considerations

### Environment Variables
- Never include credentials in Dockerfiles
- Use Docker secrets in production environments
- Rotate API credentials regularly

### Network Security
```bash
# Run on custom network
docker network create autotask-network

docker run -d \
  --name autotask-mcp \
  --network autotask-network \
  --env-file .env \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

### Read-Only Container
```bash
docker run -d \
  --name autotask-mcp \
  --read-only \
  --tmpfs /tmp \
  --env-file .env \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

## Production Deployment

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: autotask-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: autotask-mcp
  template:
    metadata:
      labels:
        app: autotask-mcp
    spec:
      containers:
      - name: autotask-mcp
        image: ghcr.io/wyre-ai/autotask-mcp:latest
        env:
        - name: AUTOTASK_USERNAME
          valueFrom:
            secretKeyRef:
              name: autotask-credentials
              key: username
        - name: AUTOTASK_SECRET
          valueFrom:
            secretKeyRef:
              name: autotask-credentials
              key: secret
        - name: AUTOTASK_INTEGRATION_CODE
          valueFrom:
            secretKeyRef:
              name: autotask-credentials
              key: integration-code
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Docker Swarm

```yaml
version: '3.8'

services:
  autotask-mcp:
    image: ghcr.io/wyre-ai/autotask-mcp:latest
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - LOG_LEVEL=info
      - NODE_ENV=production
    secrets:
      - autotask_username
      - autotask_secret
      - autotask_integration_code

secrets:
  autotask_username:
    external: true
  autotask_secret:
    external: true
  autotask_integration_code:
    external: true
```

## Updates and Maintenance

### Updating the Container

```bash
# Pull latest version
docker pull ghcr.io/wyre-ai/autotask-mcp:latest

# Stop and remove old container
docker stop autotask-mcp
docker rm autotask-mcp

# Start new container
docker run -d \
  --name autotask-mcp \
  --env-file .env \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

### Backup and Restore

```bash
# Backup logs volume
docker run --rm -v autotask-logs:/data -v $(pwd):/backup \
  alpine tar czf /backup/autotask-logs-backup.tar.gz -C /data .

# Restore logs volume
docker run --rm -v autotask-logs:/data -v $(pwd):/backup \
  alpine tar xzf /backup/autotask-logs-backup.tar.gz -C /data
```

For more information, see the main [README.md](README.md) or visit the [GitHub repository](https://github.com/WYRE-AI/autotask-mcp). 