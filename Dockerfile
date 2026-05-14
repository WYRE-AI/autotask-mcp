# Multi-stage build for efficient container size
FROM node:22-alpine AS builder

# Build arguments
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

# node:22-alpine ships with npm 10.x — no need to install globally
# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (--ignore-scripts prevents 'prepare' from running before source is copied)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Bake the release VERSION (from the docker build-args) into package.json
# before `npm run build`. The runtime reads version from `import packageJson`
# (see src/utils/config.ts), so this is what ends up in serverInfo.version and
# the /health response. Necessary because @semantic-release/git's push-back to
# main is silently dropped by branch protection on this repo — package.json on
# main stays stale, so the release pipeline has to inject the real version at
# image-build time.
#
# Deliberately placed AFTER `npm ci` so the (expensive) dependency install
# layer stays cached across releases; only the build step is invalidated when
# VERSION changes. Skipped when VERSION="unknown" (local dev builds) so we
# don't clobber the checked-in version with a placeholder.
RUN if [ "${VERSION}" != "unknown" ]; then \
      npm pkg set version="${VERSION}" && \
      echo "Patched package.json version → ${VERSION}"; \
    fi

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS production

# Create a non-root user for security
RUN addgroup -g 1001 -S autotask && \
    adduser -S autotask -u 1001 -G autotask

# Set working directory
WORKDIR /app

# Copy package files and built application from builder stage. package.json
# comes from the builder so it carries the VERSION patch applied above (not
# the stale on-disk version from the build context).
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Prune dev dependencies (avoids re-installing git deps which need build tools)
RUN npm prune --omit=dev && npm cache clean --force

# Create logs directory
RUN mkdir -p /app/logs && chown -R autotask:autotask /app

# Switch to non-root user
USER autotask

# Expose port (if needed for future HTTP interface)
EXPOSE 8080

# Health check against the actual HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV LOG_FORMAT=json
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
ENV MCP_HTTP_HOST=0.0.0.0
# Default to env mode for backward compatibility; set to 'gateway' for hosted deployment
ENV AUTH_MODE=env

# Define volume for logs
VOLUME ["/app/logs"]

# Start the application directly (HTTP transport doesn't need the stdio wrapper)
CMD ["node", "dist/index.js"]

# Build arguments for runtime
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown" 
ARG BUILD_DATE="unknown"

# Labels for metadata
LABEL maintainer="engineering@wyre.ai"
LABEL version="${VERSION}"
LABEL description="Autotask MCP Server - Model Context Protocol server for Kaseya Autotask PSA"
LABEL org.opencontainers.image.title="autotask-mcp"
LABEL org.opencontainers.image.description="Model Context Protocol server for Kaseya Autotask PSA integration"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/wyre-technology/autotask-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/wyre-technology/autotask-mcp/blob/main/README.md"
LABEL org.opencontainers.image.url="https://github.com/wyre-technology/autotask-mcp/pkgs/container/autotask-mcp"
LABEL org.opencontainers.image.vendor="Wyre Technology"
LABEL org.opencontainers.image.licenses="Apache-2.0"

# MCP Registry ownership annotation (must match `name` in server.json)
LABEL io.modelcontextprotocol.server.name="io.github.wyre-technology/autotask-mcp"
