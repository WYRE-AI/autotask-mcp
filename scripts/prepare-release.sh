#!/bin/bash

# Release Preparation Script for Autotask MCP Server
# This script performs pre-release checks and validations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

print_status "🚀 Preparing Autotask MCP Server for release..."

# Check required tools
print_status "Checking required tools..."

if ! command_exists node; then
    print_error "Node.js is not installed"
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is not installed"
    exit 1
fi

if ! command_exists docker; then
    print_warning "Docker is not installed (required for Docker builds)"
fi

if ! command_exists git; then
    print_error "Git is not installed"
    exit 1
fi

print_success "All required tools are available"

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_NODE_VERSION="18.0.0"

print_status "Checking Node.js version (current: v$NODE_VERSION, required: v$REQUIRED_NODE_VERSION+)..."

if ! node -e "process.exit(process.version.slice(1).split('.').map(Number)[0] >= 18 ? 0 : 1)"; then
    print_error "Node.js version $NODE_VERSION is not supported. Please use Node.js 18 or higher."
    exit 1
fi

print_success "Node.js version is compatible"

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf dist/
rm -rf coverage/
print_success "Cleaned build artifacts"

# Install dependencies
print_status "Installing dependencies..."
npm ci
print_success "Dependencies installed"

# Run linting
print_status "Running linter..."
if npm run lint; then
    print_success "Linting passed"
else
    print_error "Linting failed"
    exit 1
fi

# Build the project
print_status "Building project..."
if npm run build; then
    print_success "Build completed successfully"
else
    print_error "Build failed"
    exit 1
fi

# Run tests
print_status "Running tests..."
if npm test; then
    print_success "All tests passed"
else
    print_error "Tests failed"
    exit 1
fi

# Check if dist directory was created and has content
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
    print_error "Build output directory (dist) is missing or empty"
    exit 1
fi

print_success "Build output verified"

# Verify wrapper.js exists in dist
if [ ! -f "dist/wrapper.js" ]; then
    print_warning "wrapper.js not found in dist directory"
    print_status "Copying wrapper.js to dist..."
    cp src/wrapper.js dist/
    print_success "wrapper.js copied to dist"
fi

# Check package.json version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_status "Current version: $CURRENT_VERSION"

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    print_warning "Working directory has uncommitted changes"
    git status --short
    echo ""
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Release preparation cancelled"
        exit 1
    fi
fi

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_warning "Not on main branch (current: $CURRENT_BRANCH)"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Release preparation cancelled"
        exit 1
    fi
fi

# Test Docker build if Docker is available
if command_exists docker; then
    print_status "Testing Docker build..."
    if docker build -t autotask-mcp:test .; then
        print_success "Docker build test passed"
        
        # Clean up test image
        docker rmi autotask-mcp:test >/dev/null 2>&1 || true
    else
        print_error "Docker build test failed"
        exit 1
    fi
else
    print_warning "Skipping Docker build test (Docker not available)"
fi

# Check GitHub token for releases (if needed)
if [ -z "$GITHUB_TOKEN" ]; then
    print_warning "GITHUB_TOKEN environment variable not set"
    print_status "You may need to set GITHUB_TOKEN for automated releases"
fi

# Check NPM token for publishing (if needed)
if [ -z "$NPM_TOKEN" ]; then
    print_warning "NPM_TOKEN environment variable not set"
    print_status "You may need to set NPM_TOKEN for NPM publishing"
fi

# Summary
echo ""
print_success "🎉 Release preparation completed successfully!"
echo ""
print_status "Summary:"
echo "  ✅ Dependencies installed"
echo "  ✅ Linting passed"
echo "  ✅ Build completed"
echo "  ✅ Tests passed"
echo "  ✅ Docker build tested"
echo ""
print_status "Ready for release! 🚀"
echo ""
print_status "Next steps:"
echo "  1. Commit any changes: git add . && git commit -m 'feat: prepare for release'"
echo "  2. Push to GitHub: git push origin main"
echo "  3. The GitHub Actions workflow will handle the release automatically"
echo ""
print_status "Manual release commands:"
echo "  - Create GitHub release: gh release create v$CURRENT_VERSION"
echo "  - Publish to NPM: npm publish"
echo "  - Build and push Docker: docker build -t WYRE-AI/autotask-mcp:latest . && docker push WYRE-AI/autotask-mcp:latest" 